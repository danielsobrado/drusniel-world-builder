import * as THREE from 'three';
import { clamp, dot, float, length, max, mix, normalize, pow, uniform, uniformArray, vec3 } from 'three/tsl';

/** Effect lights the particle shader sees; the scene sees the same lights. */
export const VFX_SHADER_LIGHT_COUNT = 4;

/**
 * Lighting inputs shared by the particle and decal materials: the sun, a
 * hemisphere ambient and the effect light pool. Particles are unlit node
 * materials shaded by hand from these, so smoke is lit by the explosion inside
 * it without paying for the scene's full light loop on every sprite.
 */
export function createVfxLightingUniforms() {
  const lightPositions = Array.from({ length: VFX_SHADER_LIGHT_COUNT }, () => new THREE.Vector4(0, -1e6, 0, 1));
  const lightColors = Array.from({ length: VFX_SHADER_LIGHT_COUNT }, () => new THREE.Vector4(0, 0, 0, 0));
  const uniforms = {
    sunDirection: uniform(new THREE.Vector3(0.3, 0.8, 0.2).normalize()),
    sunColor: uniform(new THREE.Color(1, 0.95, 0.85)),
    /** Hemisphere ambient: what an upward face sees, and a downward one. */
    ambientSky: uniform(new THREE.Color(0.4, 0.46, 0.56)),
    ambientGround: uniform(new THREE.Color(0.22, 0.2, 0.16)),
    /** Overall HDR scale of particle and decal emission (bloom threshold is ~2). */
    emissionScale: uniform(0.5),
    /** Seconds, for shader animation (smoke boiling). */
    time: uniform(0),
    cameraPosition: uniform(new THREE.Vector3()),
    cameraRight: uniform(new THREE.Vector3(1, 0, 0)),
    cameraUp: uniform(new THREE.Vector3(0, 1, 0)),
    lightPositions: uniformArray(lightPositions, 'vec4'),
    lightColors: uniformArray(lightColors, 'vec4'),
    lightPositionValues: lightPositions,
    lightColorValues: lightColors,
  };
  return uniforms;
}

function effectLights(uniforms, worldPosition, normal, transmit) {
  let light = vec3(0, 0, 0);
  for (let index = 0; index < VFX_SHADER_LIGHT_COUNT; index += 1) {
    const position = uniforms.lightPositions.element(index);
    const colour = uniforms.lightColors.element(index);
    const toLight = position.xyz.sub(worldPosition);
    const distance = max(length(toLight), 0.001);
    const falloff = clamp(float(1).sub(distance.div(position.w)), 0, 1);
    // Fire inside a cloud lights it from within: thin smoke passes it through.
    const facing = clamp(dot(normal, normalize(toLight)).mul(0.5).add(0.5), 0, 1);
    light = light.add(colour.xyz.mul(falloff.mul(falloff).mul(mix(facing, 1, transmit))));
  }
  return light;
}

/**
 * Half-Lambert sun, hemisphere ambient and the effect lights for a world
 * normal — enough for decals and solid debris. `wrap` softens the terminator.
 */
export function shadeVfx(uniforms, worldPosition, normal, wrap = 0.55) {
  const sunTerm = clamp(dot(normal, uniforms.sunDirection).mul(float(1).sub(wrap)).add(wrap), 0, 1);
  const ambient = mix(vec3(uniforms.ambientGround), vec3(uniforms.ambientSky), normal.y.mul(0.5).add(0.5));
  return ambient.add(vec3(uniforms.sunColor).mul(sunTerm)).add(effectLights(uniforms, worldPosition, normal, 0));
}

/**
 * Participating-media shading for smoke, dust, fog and cloud puffs.
 *
 * `density` (0 thin fringe … 1 thick core) drives three cues that make a flat
 * sprite read as a volume:
 * - self-shadowing: dense parts turned from the sun fall much darker, and
 *   the terminator is sharper than a lit sprite's;
 * - translucency: thin parts glow when the sun is behind them (silver
 *   lining), instead of every puff's edge catching light as a hard rim;
 * - sky-lit tops, earth-lit undersides from the hemisphere ambient.
 */
export function shadeVolume(uniforms, worldPosition, normal, density) {
  const sun = vec3(uniforms.sunDirection);
  // Only the normal drives the sun term: it stays continuous where puffs
  // overlap, while anything keyed to one sprite's own edge outlines it.
  const halfLambert = clamp(dot(normal, sun).mul(0.5).add(0.5), 0, 1);
  const selfShadow = pow(halfLambert, 1.6).mul(0.85).add(0.1);
  const view = normalize(worldPosition.sub(uniforms.cameraPosition));
  const backlight = pow(clamp(dot(view, sun), 0, 1), 5);
  const transmit = float(1).sub(density.mul(0.5));
  const scatter = backlight.mul(transmit).mul(0.7);
  const ambient = mix(vec3(uniforms.ambientGround), vec3(uniforms.ambientSky), normal.y.mul(0.5).add(0.5));
  const occlusion = mix(1, 0.8, density);
  return ambient.mul(occlusion)
    .add(vec3(uniforms.sunColor).mul(selfShadow.add(scatter)))
    .add(effectLights(uniforms, worldPosition, normal, transmit));
}
