import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs,
  atan,
  cameraPosition,
  clamp,
  dot,
  float,
  Fn,
  instanceColor,
  length,
  mix,
  normalLocal,
  normalize,
  normalWorldGeometry,
  positionGeometry,
  positionLocal,
  positionWorld,
  pow,
  sin,
  smoothstep,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import {
  blackbodyFireColor,
  sampleFireNoise,
  sampleFireTurbulence,
  tintedBlackbodyFireColor,
} from '../vfx/render/fireShaderNodes.js';

/**
 * Boiling 3D plasma shell for the Elemental Fireball projectile:
 * texture-driven spherical turbulence, organic vertex boil, incandescent
 * magma fissures, and a Fresnel fiery corona rim.
 */
function createFireballNodeMaterial(coreColor, glowColor) {
  const uTime = uniform(0);
  const uOpacity = uniform(1);
  const cCore = vec3(...coreColor);
  const cGlow = vec3(...glowColor);

  // Spherical UV derived from normalized object-space surface direction.
  const dir = normalize(positionGeometry);
  const sphereUv = vec2(dir.x.mul(0.5).add(dir.z.mul(0.35)), dir.y.mul(0.6));

  // Gentle 3D vertex boil so the fireball silhouette churns organically in flight.
  const dispSample = sampleFireNoise(sphereUv.mul(1.3).add(vec2(uTime.mul(0.35), uTime.mul(-0.85))), 'sky');
  const disp = dispSample.r.sub(0.5).mul(0.18).add(dispSample.b.sub(0.5).mul(0.1));

  const fragment = Fn(() => {
    const surface = normalize(positionGeometry);
    const uvA = vec2(surface.x.mul(0.65).add(surface.z.mul(0.45)), surface.y.mul(0.75))
      .add(vec2(uTime.mul(0.28), uTime.mul(-0.92)));
    const uvB = vec2(surface.z.mul(0.85).sub(surface.x.mul(0.35)), surface.y.mul(1.1))
      .add(vec2(uTime.mul(-0.42), uTime.mul(-1.35)));
    const flowA = sampleFireNoise(uvA, 'sky');
    const flowB = sampleFireNoise(uvB, 'meso');

    const cells = mix(flowA.r, flowB.b, 0.45);
    const turbulence = mix(flowA.b, flowB.g, 0.5);
    const fissures = smoothstep(0.32, 0.84, cells.mul(0.7).add(turbulence.mul(0.45)));
    const whiteHot = smoothstep(0.68, 0.96, cells.mul(0.65).add(flowA.g.mul(0.42)));

    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const ndotv = clamp(abs(dot(normalize(normalWorldGeometry), viewDir)), 0, 1);
    const fresnel = pow(ndotv.oneMinus(), 2.1);

    const pulse = sin(uTime.mul(19).add(surface.y.mul(9))).mul(0.065).add(0.96);
    const heat = clamp(fissures.mul(0.68).add(whiteHot.mul(0.32)).add(fresnel.mul(0.28)), 0, 1);
    let color = tintedBlackbodyFireColor(heat, cGlow, cCore).mul(1.25);
    color = color.add(vec3(1.0, 0.95, 0.72).mul(whiteHot).mul(0.55));
    color = color.add(cGlow.mul(fresnel).mul(0.85));
    color = color.mul(pulse);

    const alpha = clamp(
      float(0.58).add(fissures.mul(0.34)).add(fresnel.mul(0.32)).mul(uOpacity),
      0,
      1,
    );
    return vec4(color, alpha);
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fireball-spell-node';
  material.positionNode = positionLocal.add(normalLocal.mul(disp));
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime, uOpacity };
}

/**
 * Directional flame wake cone trailing behind the Elemental Fireball in flight.
 */
function createFireballWakeMaterial(coreColor, glowColor) {
  const uTime = uniform(0);
  const uOpacity = uniform(1);
  const cCore = vec3(...coreColor);
  const cGlow = vec3(...glowColor);

  const fragment = Fn(() => {
    const uvN = uv();
    // ConeGeometry uv.y = 0 at base (nose of projectile), 1 at tip (trailing tail).
    const along = uvN.y;
    const turb = sampleFireTurbulence(vec2(uvN.x.mul(2.0), along.mul(1.4)), uTime.mul(2.2), vec2(0.41, 0.19), {
      broadScale: vec2(0.6, 0.55),
      fineScale: vec2(1.4, 1.15),
      broadSpeed: 0.9,
      fineSpeed: 1.55,
      warpStrength: 0.18,
      gain: 1.35,
    });
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const softEdge = pow(clamp(abs(dot(normalize(normalWorldGeometry), viewDir)), 0, 1), 0.75);
    const noseFade = smoothstep(0.0, 0.16, along);
    const tailErode = smoothstep(1.0, 0.25, along.add(turb.erosion.sub(0.5).mul(0.55)));
    const tongues = smoothstep(0.24, 0.85, turb.cells.mul(0.65).add(turb.licks.mul(0.55)).add(float(1).sub(along).mul(0.5)));
    const heat = clamp(float(1).sub(along).mul(0.78).add(turb.cells.sub(0.5).mul(0.35)), 0, 1);
    const color = tintedBlackbodyFireColor(heat, cGlow, cCore).mul(1.25);
    const alpha = clamp(noseFade.mul(tailErode).mul(tongues).mul(softEdge).mul(0.92).mul(uOpacity), 0, 1);
    return vec4(color, alpha);
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fireball-spell-wake-node';
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime, uOpacity };
}

/**
 * Soft billowing fiery wisps for the Elemental Fireball's instanced flight trail.
 */
function createFireballTrailMaterial(coreColor, glowColor) {
  const uTime = uniform(0);
  const cCore = vec3(...coreColor);
  const cGlow = vec3(...glowColor);

  const fragment = Fn(() => {
    const surface = normalize(positionGeometry);
    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const facing = clamp(abs(dot(normalize(normalWorldGeometry), viewDir)), 0, 1);
    const softSphere = pow(facing, 1.35);

    const flowUv = vec2(surface.x.mul(0.8).add(positionWorld.x.mul(0.17)), surface.y.mul(0.8).sub(uTime.mul(1.3)));
    const n = sampleFireNoise(flowUv, 'sky');
    const wisp = smoothstep(0.22, 0.86, softSphere.mul(0.85).add(n.r.mul(0.38)).add(n.b.sub(0.5).mul(0.35)));
    const heat = clamp(softSphere.mul(0.75).add(n.g.sub(0.5).mul(0.35)), 0, 1);
    const color = tintedBlackbodyFireColor(heat, cGlow, cCore).mul(instanceColor).mul(1.3);
    return vec4(color, clamp(wisp.mul(0.82), 0, 1));
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fireball-spell-trail-node';
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime };
}

/**
 * Eroding pyroclastic plasma dome for the Elemental Fireball's impact detonation.
 */
function createFireballImpactDomeMaterial(coreColor, glowColor) {
  const uTime = uniform(0);
  const uProgress = uniform(0);
  const cCore = vec3(...coreColor);
  const cGlow = vec3(...glowColor);

  const dir = normalize(positionGeometry);
  const boilUv = vec2(dir.x.mul(0.85).add(dir.z.mul(0.55)), dir.y.mul(0.85).sub(uTime.mul(0.65)));
  const boil = sampleFireNoise(boilUv, 'sky').r.sub(0.5).mul(0.22).mul(smoothstep(0, 0.4, uProgress));

  const fragment = Fn(() => {
    const surface = normalize(positionGeometry);
    const p = clamp(uProgress, 0, 1);
    const uvA = vec2(surface.x.mul(0.9).add(surface.z.mul(0.5)), surface.y.mul(0.95).sub(uTime.mul(0.85)));
    const uvB = vec2(surface.z.mul(1.3).sub(surface.x.mul(0.6)), surface.y.mul(1.3).sub(uTime.mul(1.25)));
    const a = sampleFireNoise(uvA, 'sky');
    const b = sampleFireNoise(uvB, 'meso');

    const clouds = mix(a.r, b.g, 0.45);
    const erosionBar = pow(p, 1.15).mul(0.92);
    const mask = smoothstep(erosionBar, erosionBar.add(0.26), clouds.mul(0.75).add(a.b.mul(0.4)));

    const viewDir = normalize(cameraPosition.sub(positionWorld));
    const facing = clamp(abs(dot(normalize(normalWorldGeometry), viewDir)), 0, 1);
    const softSilhouette = smoothstep(0.05, 0.55, facing);

    const heat = clamp(float(1).sub(p.mul(0.72)).mul(0.68).add(clouds.mul(0.45)).add(b.b.sub(0.5).mul(0.25)), 0, 1);
    const color = mix(blackbodyFireColor(heat), tintedBlackbodyFireColor(heat, cGlow, cCore), 0.45).mul(1.45);
    const fade = float(1).sub(smoothstep(0.32, 0.96, p));
    return vec4(color, clamp(mask.mul(softSilhouette).mul(fade), 0, 1));
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fireball-spell-impact-dome-node';
  material.positionNode = positionLocal.add(normalLocal.mul(boil));
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.FrontSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime, uProgress };
}

/**
 * Turbulent fiery radial shockwave ring for the Elemental Fireball impact.
 */
function createFireballShockRingMaterial(coreColor, glowColor) {
  const uTime = uniform(0);
  const uProgress = uniform(0);
  const cCore = vec3(...coreColor);
  const cGlow = vec3(...glowColor);

  const fragment = Fn(() => {
    const p = clamp(uProgress, 0, 1);
    const centered = uv().sub(0.5).mul(2);
    const r = length(centered);
    const angle = atan(centered.y, centered.x).div(6.28318).add(0.5);

    const streaks = sampleFireNoise(vec2(angle.mul(3.5), r.mul(1.2).sub(uTime.mul(1.6))), 'sky');
    const band = smoothstep(0.42, 0.78, r).mul(smoothstep(1.0, 0.84, r));
    const broken = band.mul(smoothstep(0.18, 0.82, streaks.b.mul(0.7).add(streaks.r.mul(0.55))));
    const heat = clamp(float(1).sub(p.mul(0.65)).mul(0.65).add(streaks.r.mul(0.4)), 0, 1);
    const color = tintedBlackbodyFireColor(heat, cGlow, cCore).mul(1.3);
    const fade = float(1).sub(smoothstep(0.38, 1.0, p));
    return vec4(color, clamp(broken.mul(fade).mul(0.92), 0, 1));
  })();

  const material = new MeshBasicNodeMaterial();
  material.name = 'fireball-spell-shock-ring-node';
  material.colorNode = fragment.xyz;
  material.opacityNode = fragment.w;
  material.transparent = true;
  material.depthTest = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  material.blending = THREE.AdditiveBlending;
  material.toneMapped = false;
  return { material, uTime, uProgress };
}

export {
  createFireballImpactDomeMaterial,
  createFireballNodeMaterial,
  createFireballShockRingMaterial,
  createFireballTrailMaterial,
  createFireballWakeMaterial,
};
