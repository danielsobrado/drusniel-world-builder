import { frameUniform } from '../../../render/FrameUniforms.js';
import * as THREE from 'three/webgpu';
import {
  attribute, cameraPosition, clamp, color, cross, dFdx, dFdy, dot, exp, float, max, mix, mx_noise_float,
  normalWorld, normalize, positionGeometry, positionWorld, reflect, refract, select, smoothstep, texture,
  varying, vec3,
} from 'three/tsl';
import { skyLightUniforms, snowLightUniforms } from '../sky/skyLight.js';
import { acquireIceTextures } from './iceTextures.js';

/** Beer-Lambert glacial ice absorption per metre (deep cobalt cores, aqua sheared rims). */
const ICE_ABSORB = vec3(2.55, 0.82, 0.28);
const ICE_F0 = 0.022;
const FROST_COLOR = color('#e8f0f8');

/** Analytic sky + snow-bounce color along a refracted/reflected direction (zero viewport copy!). */
function analyticEnvColor(dir) {
  const up = clamp(dir.y, -1, 1);
  const skyGrad = mix(vec3(0.56, 0.74, 0.90), vec3(0.18, 0.42, 0.76), smoothstep(0, 0.75, up));
  const snowBounce = vec3(0.42, 0.60, 0.78).mul(snowLightUniforms.brightness);
  return mix(snowBounce, skyGrad, smoothstep(-0.18, 0.14, up))
    .mul(skyLightUniforms.reflectionTint)
    .mul(skyLightUniforms.brightness);
}

/**
 * Translucent faceted glacier serac & ice-fin material (combining Snowflow's
 * `crystal.fragment.wgsl` 3-IOR chromatic dispersion, flat-facet derivative
 * normals, depth-writing translucent alpha & frosted snow base collar with
 * internal parallax fracture textures — zero viewport copies).
 */
export function createGlacierSeracMaterial({ sunDirection = null } = {}) {
  const { detail } = acquireIceTextures();
  const material = new THREE.MeshBasicNodeMaterial({
    name: 'glacier-serac-crystal',
    transparent: true,
    depthWrite: true,
    side: THREE.FrontSide,
    forceSinglePass: true,
  });

  const height01 = varying(attribute('seracHeight01', 'float'));
  const seed = varying(attribute('instanceSeed', 'float'));
  const world = positionWorld.toVar();
  const view = normalize(cameraPosition.sub(world)).toVar();
  const sun = sunDirection
    ? normalize(frameUniform(sunDirection))
    : vec3(0.35, 0.72, 0.45).normalize();

  // Flat-facet geometric normal from world derivatives: hard facet edges are what read as ice!
  const rawN = normalize(cross(dFdx(world), dFdy(world)));
  const N = select(dot(rawN, view).lessThan(0), rawN.negate(), rawN).toVar();
  const ndv = clamp(dot(N, view), 0.01, 1);
  const ndl = dot(N, sun);

  // Frosted snow base collar (bottom 32%) + drifted snow caps on upward ledges anchor the serac to the glacier.
  const grain = mx_noise_float(world.mul(2.8).add(seed.mul(19))).mul(0.5).add(0.5);
  const baseFrost = smoothstep(0.04, 0.34, height01).oneMinus().mul(grain.mul(0.45).add(0.55));
  const topCap = smoothstep(0.56, 0.84, normalWorld.y.add(grain.sub(0.5).mul(0.28))).mul(0.92);
  const frost = clamp(max(baseFrost, topCap), 0, 1).toVar();

  // Optical path length through the ice body: deep sapphire interior, translucent aqua at sheared ridges.
  const path = clamp(
    float(0.42).add(height01.oneMinus().mul(0.95)).mul(float(0.85).add(ndv.oneMinus().mul(1.65))),
    0.15,
    2.6,
  );
  const transmit = exp(ICE_ABSORB.mul(path).negate());
  // Directional facet contrast: shadowed ice facets drop into moody glacial cobalt; sunlit facets gleam!
  const facetShade = float(0.34).add(clamp(ndl, 0, 1).mul(0.66));

  // 3-IOR chromatic dispersion along refracted rays (zero scene texture copy!).
  const mirror = reflect(view.negate(), N);
  const rr = refract(view.negate(), N, 1 / 1.305);
  const rg = refract(view.negate(), N, 1 / 1.309);
  const rb = refract(view.negate(), N, 1 / 1.317);
  const dr = select(dot(rr, rr).greaterThan(0.5), rr, mirror);
  const dg = select(dot(rg, rg).greaterThan(0.5), rg, mirror);
  const db = select(dot(rb, rb).greaterThan(0.5), rb, mirror);
  const behind = vec3(analyticEnvColor(dr).r, analyticEnvColor(dg).g, analyticEnvColor(db).b);

  // Internal parallax fracture & vein inclusions sliding behind the facet.
  const innerCoord = positionGeometry.xz.mul(1.8).add(dg.xz.mul(0.24));
  const cracks = texture(detail, innerCoord).b;
  const veins = texture(detail, positionGeometry.xy.mul(1.5).add(dg.xy.mul(0.20))).r;
  const inclusions = max(cracks.mul(0.90), veins.mul(0.62));
  const deepCore = vec3(0.16, 0.48, 0.72).mul(skyLightUniforms.brightness).mul(facetShade);
  let col = behind.mul(transmit).mul(facetShade).add(deepCore.mul(float(1).sub(transmit.b).mul(0.55)));
  col = col.add(vec3(0.45, 0.85, 1.0).mul(inclusions).mul(transmit).mul(facetShade).mul(0.52));

  // Internal backlit transport: glows luminous glacial turquoise when backlit by the sun.
  const transDir = normalize(sun.add(N.mul(0.42)));
  const through = clamp(dot(view, transDir.negate()), 0, 1).pow(2.4);
  const deepTint = mix(vec3(0.14, 0.56, 0.86), vec3(0.65, 0.92, 1.0), exp(path.mul(-1.8)));
  col = col.add(skyLightUniforms.sunColor.mul(deepTint).mul(through).mul(0.48));
  col = col.add(deepTint.mul(skyLightUniforms.reflectionTint).mul(skyLightUniforms.brightness).mul(facetShade).mul(0.10));

  // Frosted snow collar & cap shading (wrapped diffuse + cool shade fill matching terrain snow).
  const wrapDiff = max(ndl.add(0.55).div(1.55 * 1.55), float(0));
  const frostLit = FROST_COLOR
    .mul(skyLightUniforms.sunColor.mul(wrapDiff).add(snowLightUniforms.shadeTint.mul(skyLightUniforms.brightness).mul(0.58)))
    .mul(snowLightUniforms.brightness.max(0.85));
  col = mix(col, frostLit, frost.mul(0.95));

  // Sharp Fresnel mirror reflection + crisp sun facet glint.
  const fresnel = float(ICE_F0).add(float(1 - ICE_F0).mul(ndv.oneMinus().pow(5)));
  col = mix(col, analyticEnvColor(mirror), fresnel.mul(frost.mul(0.8).oneMinus()).mul(0.85));
  const halfDir = normalize(view.add(sun));
  const spec = clamp(dot(N, halfDir), 0, 1).pow(mix(float(160), float(24), frost)).mul(max(ndl, float(0)).smoothstep(0, 0.15));
  col = col.add(skyLightUniforms.sunColor.mul(spec).mul(frost.mul(0.8).oneMinus()).mul(1.65));

  material.colorNode = col;
  // Depth-writing translucent alpha: translucent at thin sunlit crests, solid at frosted base & thick cores.
  material.opacityNode = clamp(
    float(0.66).add(float(1).sub(exp(path.mul(-1.8))).mul(0.24)).add(ndv.oneMinus().mul(0.18)).add(frost.mul(0.55)),
    0,
    1,
  );
  return material;
}
