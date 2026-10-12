import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  attribute,
  clamp,
  cos,
  cross,
  dot,
  float,
  floor,
  max,
  min,
  mix,
  mod,
  mx_noise_float,
  smoothstep,
  normalize,
  positionGeometry,
  positionWorld,
  sign,
  sin,
  sqrt,
  step,
  texture,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { atlasTileUv, sampleRamp } from './atlasNodes.js';
import { shadeVfx, shadeVolume } from './VfxLightingUniforms.js';

/**
 * The one particle material. Every sprite — flash, fireball puff, spark,
 * lightning segment, ground ring, smoke — goes through it in one sorted,
 * instanced draw.
 *
 * Blending is premultiplied (One, OneMinusSrcAlpha): a particle's `additive`
 * zeroes its alpha so it adds light, and as it cools toward 0 it starts
 * occluding — fire turns into smoke without changing draw calls.
 */
export function createParticleMaterial({ atlas, lighting }) {
  const a = attribute('vfxA', 'vec4');
  const b = attribute('vfxB', 'vec4');
  const c = attribute('vfxC', 'vec4');
  const d = attribute('vfxD', 'vec4');
  const e = attribute('vfxE', 'vec4');

  const center = a.xyz;
  const size = a.w;
  const rotation = b.x;
  const packed = e.x;
  const rampAndOrient = floor(packed);
  const orient = mod(rampAndOrient, 4);
  const rampIndex = floor(rampAndOrient.div(4));
  const seed = packed.sub(rampAndOrient).div(0.9);
  const corner = positionGeometry.xy;
  const cosR = cos(rotation);
  const sinR = sin(rotation);

  // Camera-facing, rotated.
  const camX = vec3(lighting.cameraRight).mul(cosR).add(vec3(lighting.cameraUp).mul(sinR));
  const camY = vec3(lighting.cameraUp).mul(cosR).sub(vec3(lighting.cameraRight).mul(sinR));
  // Axial: long side on the axis, broad side turned toward the camera.
  const axis = normalize(c.xyz);
  const toCamera = normalize(vec3(lighting.cameraPosition).sub(center));
  const axisSide = normalize(cross(axis, toCamera).add(vec3(lighting.cameraRight).mul(1e-4)));
  // Planar: lies in the plane whose normal is the axis (ground rings, decals in air).
  const reference = mix(vec3(0, 0, 1), vec3(1, 0, 0), step(0.99, abs(axis.z)));
  const planeT = normalize(cross(reference, axis));
  const planeB = cross(axis, planeT);
  const planeX = planeT.mul(cosR).add(planeB.mul(sinR));
  const planeY = planeB.mul(cosR).sub(planeT.mul(sinR));

  const wCamera = float(1).sub(step(0.5, orient));
  const wAxis = step(0.5, orient).sub(step(1.5, orient));
  const wPlane = step(1.5, orient);
  const basisX = camX.mul(wCamera).add(axisSide.mul(wAxis)).add(planeX.mul(wPlane));
  const basisY = camY.mul(wCamera).add(axis.mul(wAxis)).add(planeY.mul(wPlane));
  const extentY = mix(size, c.w, wAxis);

  const worldPosition = center
    .add(basisX.mul(corner.x.mul(size)))
    .add(basisY.mul(corner.y.mul(extentY)));

  // Varyings, packed four to a slot: WebGPU allows 16 vertex outputs and
  // every scalar varying would take a whole one.
  const tile = b.y;
  const tileA = floor(tile.add(1e-3));
  const vBasisX = varying(basisX);
  const vBasisY = varying(basisY);
  const vSprite = varying(vec4(uv(), tileA, tile.sub(tileA)));
  const vLook = varying(vec4(b.z, b.w, d.w, rampIndex));
  const vColour = varying(vec4(d.xyz, e.z));
  const vMotion = varying(vec4(mod(e.y, 2), step(1.5, e.y), e.w, seed));
  const vLocalUv = vSprite.xy;
  const vTileA = vSprite.z;
  const vFrac = vSprite.w;
  const vHeat = vLook.x;
  const vAlpha = vLook.y;
  const vEmissive = vLook.z;
  const vRamp = vLook.w;
  const vTint = vColour.xyz;
  const vAdditive = vColour.w;
  const vLit = vMotion.x;
  const vBillow = vMotion.y;
  const vLife = vMotion.z;
  const vSeed = vMotion.w;
  // The sprite's facing, turned toward the camera, rebuilt per fragment.
  const basisZRaw = normalize(cross(vBasisX, vBasisY));
  const vBasisZ = basisZRaw.mul(sign(dot(basisZRaw, vec3(lighting.cameraPosition).sub(positionWorld)).add(1e-5)));

  // Boiling: puffs warp their own texture with slowly evolving noise, more as
  // they age, so the silhouette curls and changes instead of only scaling.
  // The field also drifts down the sprite, so lobes appear to roll upward.
  const flow = vec3(vLocalUv.mul(2.2).add(vec2(0, lighting.time.mul(-0.12))), lighting.time.mul(0.5).add(vSeed.mul(37)));
  const warpX = mx_noise_float(flow);
  const warpY = mx_noise_float(flow.add(vec3(19.7, 7.3, 3.1)));
  const warpAmount = vBillow.mul(vLife.mul(0.12).add(0.05));
  const boiled = vLocalUv.add(vec3(warpX, warpY, 0).xy.mul(warpAmount));
  // Keep the warp inside the tile so it never samples a neighbour.
  const localUv = clamp(boiled, 0.02, 0.98);
  const texel = mix(
    texture(atlas, atlasTileUv(vTileA, localUv)),
    texture(atlas, atlasTileUv(min(vTileA.add(1), float(63)), localUv)),
    vFrac,
  );
  // Erosion: late in life a puff tears into wisps instead of fading evenly.
  const tear = mx_noise_float(vec3(vLocalUv.mul(5.5), vSeed.mul(23).add(lighting.time.mul(0.2)))).mul(0.5).add(0.5);
  const erode = vBillow.mul(smoothstep(0.35, 1, vLife)).mul(0.7);
  // Only ever removes coverage: boosting soft edges back up outlines every puff.
  const coverage = texel.a.mul(float(1).sub(erode.mul(smoothstep(0.25, 0.75, float(1).sub(tear)))));
  const detail = texel.b;
  const nxy = texel.rg.mul(2).sub(1);
  const nz = sqrt(max(float(0), float(1).sub(dot(nxy, nxy))));
  // Puffs keep a gentler relief; their volume comes from the density cues below.
  const relief = mix(1, 0.7, vBillow);
  const bumped = vBasisX.mul(nxy.x.mul(relief)).add(vBasisY.mul(nxy.y.mul(relief))).add(vBasisZ.mul(nz));
  // Solid sprites flatten toward the camera at their thin fringe. Puffs keep one
  // blend everywhere: a fringe that turns back to the camera catches the sun
  // differently from the body just inside it, and draws a ring round every puff.
  const facing = mix(smoothstep(0.35, 0.9, texel.a), 0.6, vBillow);
  const normal = normalize(mix(vBasisZ, bumped, facing));

  // Per-texel heat: hot cores, cooler fringes.
  const heat = clamp(vHeat.mul(detail.mul(0.8).add(0.3)), 0, 1);
  const ramp = sampleRamp(atlas, vRamp, heat);
  const emission = ramp.rgb.mul(ramp.a).mul(vEmissive).mul(lighting.emissionScale).mul(mix(vTint, vec3(1), vLit));
  // Density: thick cores self-shadow and occlude their crevices, thin fringes
  // let light through. Each puff also shifts a little warm or cool.
  const density = smoothstep(0.15, 0.95, texel.a).mul(detail.mul(0.35).add(0.65));
  const hue = vSeed.sub(0.5).mul(0.16).mul(vBillow);
  const varied = vTint.mul(vec3(float(1).add(hue), 1, float(1).sub(hue)));
  const crevices = mix(float(1), detail.mul(0.3).add(0.7), density.mul(vBillow));
  const albedo = varied.mul(crevices);
  const lit = mix(
    shadeVfx(lighting, positionWorld, normal, 0.62),
    shadeVolume(lighting, positionWorld, normal, density),
    vBillow,
  );
  const reflected = albedo.mul(lit).mul(vLit).mul(float(1).sub(clamp(heat.mul(1.3), 0, 1)));
  const alpha = clamp(coverage.mul(vAlpha), 0, 1);

  const material = new MeshBasicNodeMaterial();
  material.name = 'vfx-particles';
  material.positionNode = worldPosition;
  material.colorNode = reflected.add(emission).mul(alpha);
  material.opacityNode = alpha.mul(float(1).sub(vAdditive));
  material.transparent = true;
  material.depthWrite = false;
  material.depthTest = true;
  material.side = THREE.DoubleSide;
  material.fog = false;
  material.toneMapped = false;
  material.blending = THREE.CustomBlending;
  material.blendEquation = THREE.AddEquation;
  material.blendSrc = THREE.OneFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendEquationAlpha = THREE.AddEquation;
  material.blendSrcAlpha = THREE.OneFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return material;
}
