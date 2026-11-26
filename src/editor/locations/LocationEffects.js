import * as THREE from 'three/webgpu';
import {
  abs, attribute, cameraFar, cameraNear, cameraPosition, clamp, color, cos, densityFogFactor, dot, float, Fn, fract,
  hash, instancedBufferAttribute, instanceIndex, int, length, linearDepth, max, min, mix, normalWorldGeometry,
  normalize, positionWorld, pow, reference, renderGroup, screenUV, sin, smoothstep, texture, time, uniform, uv,
  vec2, vec3, viewportDepthTexture, viewportSafeUV,
} from 'three/tsl';
import { REFLECTION_CLASSES, assignMaterialData } from '../../render/postprocessing/PostProcessingMaterialData.js';
import { acquireWorldNoise } from '../stylized/worldNoise.js';
import { WORLD_NOISE_LAYERS } from '../stylized/worldNoiseLayout.js';
import {
  blackbodyFireColor,
  sampleFireTurbulence,
  tintedBlackbodyFireColor,
} from '../vfx/render/fireShaderNodes.js';
import { locationLight } from './materials/LocationShading.js';

/**
 * A location's light sources and air. Each effect is one instanced draw of
 * camera-facing sprites placed in the vertex stage; none is a scene light.
 */

/** Texture tiles a torn puff spans: about six wisp lobes across it, fine enough that a rim frays rather than lumps. */
const TEAR_SCALE = 0.55;
/** Tiles a second the tear field slides down a puff, so its lobes change and seem to roll upward. */
const TEAR_DRIFT = [0.006, -0.014];
/** Gives the averaged wisp and erosion fields back the contrast of one. */
const TEAR_CONTRAST = 1.4;
/** Most of a puff's coverage a tear may take before the rest is rescaled; keeps the rescale off zero. */
const TEAR_CEILING = 0.95;

/** Flame turbulence scales across (u, -1..1) and up the sprite, and upward scroll speed at speed 1. */
const FLAME_TURB_OPTS = Object.freeze({
  broadScale: vec2(0.22, 0.28),
  fineScale: vec2(0.46, 0.54),
  broadSpeed: 0.34,
  fineSpeed: 0.58,
  warpStrength: 0.14,
  gain: 1.4,
});
/** Tiles a second a flame's noise slides sideways, so the scroll never brings the same flame back round. */
const FLAME_WANDER = 0.015;
/** Rising embers shed per location flame at quality scale 1. */
const FLAME_EMBERS_PER_SOURCE = 5;

/** The haze a shaft crosses: tiles across and along the beam (stretched along it, so it streaks), drift a second. */
const SHAFT_HAZE = { across: 1.5, along: 0.35, drift: [0.012, -0.02], swing: 0.6 };

/**
 * One tap of the shared world-noise array (worldNoiseLayout.js): three tileable
 * fields in r, g and b, each spread round a mean of 0.5 — and exactly 0.5 until
 * the file arrives, so anything that reads it must still look whole on flat noise.
 */
export const noiseTap = (at, layer) => texture(acquireWorldNoise().texture, at).depth(int(WORLD_NOISE_LAYERS[layer]));

/** A round sprite fading to nothing at its edge. */
export const softDisc = (falloff) => pow(smoothstep(0, 0.5, length(uv().sub(0.5))).oneMinus(), falloff);

/**
 * A soft disc torn into drifting wisps by the sky layer's wisp (G) and turbulent
 * erosion (B) fields. Eroded the way cloud density is: coverage below the field's
 * local bar goes and the rest is rescaled, so a puff's heart holds while its fringe
 * tears. It never exceeds `softDisc`, so the quad's edge cannot show; on flat noise
 * it is a smaller soft disc.
 *
 * @param {number} falloff as `softDisc`
 * @param {object} seed 0..1 node per sprite: which patch of the texture it wears
 * @param {object|number} tear 0 a plain disc .. 1 the fringe gone wherever the wisps thin out
 */
export function tornDisc(falloff, seed, tear) {
  const puff = softDisc(falloff);
  const field = noiseTap(uv().mul(TEAR_SCALE).add(vec2(seed.mul(7.31), seed.mul(3.17))).add(vec2(...TEAR_DRIFT).mul(time)), 'sky');
  const sparse = clamp(float(0.5).sub(mix(field.g, field.b, 0.45).sub(0.5).mul(TEAR_CONTRAST)), 0, 1);
  const bar = min(sparse.mul(tear), TEAR_CEILING);
  return clamp(puff.sub(bar).div(float(1).sub(bar)), 0, 1);
}

const flicker = (seed, amount) => {
  const draft = sin(time.mul(mix(float(2.1), float(3.4), hash(seed))).add(hash(seed.add(1.3)).mul(6.28))).mul(0.45)
    .add(sin(time.mul(mix(float(5.2), float(7.8), hash(seed.add(2.7)))).add(hash(seed.add(3.9)).mul(6.28))).mul(0.35));
  const wick = sin(time.mul(mix(float(11.0), float(15.0), hash(seed.add(5.1)))).add(seed.mul(2.1))).mul(0.2);
  return draft.add(wick).sub(0.1).mul(amount).add(1).max(0.55);
};

/**
 * Emissive surfaces — lantern globes, coals, crystals, lit windows.
 * Uses soft HDR compression and view-angle limb darkening so curved lantern
 * glass shows a hot pale-gold heart falling smoothly into rich amber/copper
 * toward the edges and frame under ACESFilmicToneMapping.
 */
export function createGlowMaterial() {
  const material = new THREE.MeshBasicNodeMaterial({ name: 'location-glow', fog: true });
  const phase = positionWorld.x.mul(1.73).add(positionWorld.z.mul(2.41)).add(positionWorld.y.mul(0.97));
  const baseFlicker = sin(time.mul(7.6).add(phase)).mul(sin(time.mul(2.9).add(phase.mul(1.37)))).mul(0.085).add(0.98);
  const heatWave = sin(positionWorld.y.mul(18.0).sub(time.mul(9.2)).add(positionWorld.x.mul(6.5))).mul(0.065).add(0.98);

  const baseTint = attribute('tint', 'vec3');
  const rawLuma = dot(baseTint, vec3(0.299, 0.587, 0.114));
  const softScale = float(1).div(rawLuma.mul(0.45).add(0.72));
  const bodyTint = baseTint.mul(softScale);
  const bodyLuma = dot(bodyTint, vec3(0.299, 0.587, 0.114));

  const facing = clamp(abs(dot(normalize(normalWorldGeometry), normalize(cameraPosition.sub(positionWorld)))), 0, 1);
  const coreMask = pow(facing, 1.55);
  const edgeColor = pow(max(bodyTint, vec3(1e-4)), vec3(1.65)).mul(0.36);
  const heartColor = bodyTint.mul(1.22).add(mix(bodyTint, vec3(bodyLuma), 0.35).mul(0.18));

  material.colorNode = mix(edgeColor, heartColor, coreMask).mul(baseFlicker).mul(heatWave);
  assignMaterialData(material, {
    roughness: 1,
    reactive: 0.9,
    reflectionClass: REFLECTION_CLASSES.NONE,
    bloomBoost: 0.72,
  });
  return material;
}

/**
 * Soft glows around light sources: what the eye reads as a lamp in dusty air,
 * without a bloom pass. Attenuates with scene FogExp2 so distant lanterns
 * recede into depth haze, and relieves the tightest core so dark lantern
 * ironwork remains crisp and un-washed.
 *
 * @param {Array<{ x: number, y: number, z: number, color: number[], size: number, flicker?: number }>} halos
 */
export function createHalos(halos) {
  const count = halos.length;
  const position = new Float32Array(count * 3);
  const tint = new Float32Array(count * 4);
  const flickerArr = new Float32Array(count);
  halos.forEach((halo, index) => {
    position.set([halo.x, halo.y, halo.z], index * 3);
    tint.set([halo.color[0], halo.color[1], halo.color[2], halo.size], index * 4);
    flickerArr[index] = halo.flicker ?? 0.08;
  });
  const material = new THREE.SpriteNodeMaterial({
    name: 'location-halos', blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  });
  const haloPos = instancedBufferAttribute(new THREE.InstancedBufferAttribute(position, 3));
  const haloTint = instancedBufferAttribute(new THREE.InstancedBufferAttribute(tint, 4));
  const haloFlicker = instancedBufferAttribute(new THREE.InstancedBufferAttribute(flickerArr, 1));

  const fogTransmittance = Fn((_, builder) => {
    const sceneFog = builder.scene?.fog;
    if (sceneFog?.isFogExp2) {
      const density = reference('density', 'float', sceneFog).setGroup(renderGroup);
      return densityFogFactor(density).oneMinus();
    }
    return float(1);
  })();

  const pulse = flicker(instanceIndex.toFloat(), haloFlicker);
  const dist = length(cameraPosition.sub(haloPos));
  const radial = length(uv().sub(0.5)).mul(2.0);
  const outerFalloff = pow(smoothstep(float(0.04), float(1.0), radial).oneMinus(), 2.5);
  const coreRelief = smoothstep(float(0.0), float(0.3), radial).mul(0.52).add(0.48);
  const nearFade = smoothstep(float(0.85), float(3.8), dist).mul(0.52).add(0.48);
  const airDepth = fogTransmittance.mul(dist.mul(-0.006).exp());

  material.positionNode = haloPos;
  material.scaleNode = vec2(haloTint.w).mul(pulse.sub(1).mul(0.45).add(1));
  material.colorNode = haloTint.rgb.mul(outerFalloff).mul(coreRelief).mul(nearFade).mul(airDepth).mul(pulse);
  const sprite = new THREE.Sprite(material);
  sprite.count = count;
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  return sprite;
}

/**
 * Animated flame tongues rendered in one instanced draw call: dual-stage
 * domain-warped turbulence, cellular licking tips, anchored hot ignition base,
 * multi-stop blackbody thermal ramp, and HDR bloom boost.
 *
 * @param {Array<{ x: number, y: number, z: number, width: number, height: number, speed: number, core: number[], outer: number[] }>} flames
 */
export function createFlames(flames) {
  const count = flames.length;
  const position = new Float32Array(count * 3);
  const scaleSpeed = new Float32Array(count * 3);
  const coreArr = new Float32Array(count * 3);
  const outerArr = new Float32Array(count * 3);
  flames.forEach((flame, index) => {
    position.set([flame.x, flame.y, flame.z], index * 3);
    scaleSpeed.set([flame.width, flame.height, flame.speed ?? 1], index * 3);
    coreArr.set(flame.core, index * 3);
    outerArr.set(flame.outer, index * 3);
  });

  const material = new THREE.SpriteNodeMaterial({
    name: 'location-flames',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const sAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(scaleSpeed, 3));
  const coreAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(coreArr, 3));
  const outerAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(outerArr, 3));
  material.positionNode = instancedBufferAttribute(new THREE.InstancedBufferAttribute(position, 3));

  const idx = instanceIndex.toFloat();
  const seed = hash(idx.add(1.37));
  const shimmer = flicker(idx.add(5.1), 0.14);
  material.scaleNode = vec2(
    sAttr.x.mul(shimmer.sub(1).mul(0.22).add(1)),
    sAttr.y.mul(shimmer.sub(1).mul(0.42).add(1)),
  );

  const u = uv().x.sub(0.5).mul(2);
  const v = uv().y;
  const scrollT = time.mul(sAttr.z);

  // Each flame burns in its own drifting patch of the shared world-noise array.
  const patch = vec2(seed.mul(7.31).add(time.mul(FLAME_WANDER)), seed.mul(3.73));
  const turb = sampleFireTurbulence(vec2(u, v), scrollT, patch, FLAME_TURB_OPTS);

  // Teardrop buoyancy envelope that widens quickly above the coals and tapers into licking tips.
  const envelope = pow(clamp(v.mul(3.8), 0, 1), 0.44).mul(pow(clamp(v.oneMinus(), 0, 1), 0.74));
  const swayWeight = v.mul(0.88).add(0.12);
  const shiftedU = u.add(turb.combined.mul(0.42).mul(swayWeight));
  const dx = abs(shiftedU);

  // Cellular ridge breakups create distinct curling tongues and pinched tips near the crest.
  const cellularCarve = turb.cells.sub(0.5).mul(0.38).mul(smoothstep(float(0.12), float(0.88), v));
  const tongues = clamp(envelope.mul(1.04).add(turb.licks.mul(0.26).mul(v)).add(cellularCarve), 0.01, 1.05);
  const tipBreakup = smoothstep(float(0.98), float(0.48), v.add(turb.licks.mul(0.32)).add(turb.erosion.sub(0.5).mul(0.36)));
  const bodyMask = smoothstep(tongues.mul(0.96), tongues.mul(0.16), dx)
    .mul(smoothstep(float(0.015), float(0.14), v))
    .mul(tipBreakup)
    .mul(smoothstep(float(0.995), float(0.84), v));

  // Internal heat field: hottest in the lower heart and turbulent filaments, cooling toward tips and rims.
  const radialHeat = smoothstep(tongues.mul(0.85), float(0), dx);
  const verticalHeat = smoothstep(float(0.9), float(0.06), v);
  const filamentBoost = turb.cells.sub(0.5).mul(0.32).add(turb.licks.mul(0.24));
  const heat = clamp(radialHeat.mul(verticalHeat.mul(0.82).add(0.22)).add(filamentBoost.mul(radialHeat)), 0, 1);

  // Subtle hot base pocket sitting right over the fuel bed.
  const fuelHeart = pow(smoothstep(float(0.42), float(0), dx).mul(smoothstep(float(0.32), float(0.06), v)), 1.6);
  const flameColor = tintedBlackbodyFireColor(heat, outerAttr, coreAttr)
    .add(mix(coreAttr, vec3(0.76, 0.88, 1.0), 0.25).mul(fuelHeart).mul(0.35));

  material.colorNode = flameColor.mul(bodyMask).mul(shimmer).mul(1.18);
  assignMaterialData(material, {
    roughness: 1,
    reactive: 0.9,
    reflectionClass: REFLECTION_CLASSES.NONE,
    bloomBoost: 0.68,
  });

  const sprite = new THREE.Sprite(material);
  sprite.count = count;
  sprite.frustumCulled = false;
  sprite.renderOrder = 2;
  return sprite;
}

/**
 * Rising ember sparks automatically shed by a location's flames: one GPU
 * instanced Sprite draw call, zero CPU simulation, spiraling lazily upward
 * and cooling along the blackbody ramp before fading out.
 *
 * @param {Array<{ x: number, y: number, z: number, width: number, height: number, speed?: number }>} flames
 * @param {number} [scale] quality multiplier on ember count
 */
export function createFlameEmbers(flames, scale = 1) {
  const perFlame = Math.max(1, Math.round(FLAME_EMBERS_PER_SOURCE * scale));
  const count = flames.length * perFlame;
  const origin = new Float32Array(count * 3);
  const bounds = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const flame = flames[index % flames.length];
    origin.set([flame.x, flame.y - flame.height * 0.22, flame.z], index * 3);
    bounds.set([flame.width, flame.height, flame.speed ?? 1], index * 3);
  }

  const material = new THREE.SpriteNodeMaterial({
    name: 'location-flame-embers',
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  });
  const oAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(origin, 3));
  const bAttr = instancedBufferAttribute(new THREE.InstancedBufferAttribute(bounds, 3));

  const idx = instanceIndex.toFloat();
  const s1 = hash(idx.mul(3.17).add(11.3));
  const s2 = hash(idx.mul(5.41).add(23.7));
  const s3 = hash(idx.mul(7.83).add(41.9));
  const life = mix(float(1.2), float(2.7), s1);
  const age = fract(time.mul(bAttr.z).div(life).add(s2));

  // Helical buoyancy rise with gentle outward drift proportional to the flame's size.
  const angle = s3.mul(6.28318).add(age.mul(mix(float(2.4), float(5.2), s2)));
  const radialDrift = bAttr.x.mul(mix(float(0.18), float(0.65), age)).mul(mix(float(0.45), float(1.1), s1));
  const rise = bAttr.y.mul(mix(float(0.9), float(2.1), s2)).mul(pow(age, 0.85));
  material.positionNode = oAttr.add(vec3(cos(angle).mul(radialDrift), rise, sin(angle).mul(radialDrift)));

  const emberSize = clamp(bAttr.x.mul(0.065), float(0.025), float(0.095))
    .mul(mix(float(1.0), float(0.35), age));
  material.scaleNode = vec2(emberSize);

  const radial = length(uv().sub(0.5)).mul(2.0);
  const mote = pow(smoothstep(float(1.0), float(0.0), radial), 2.4);
  const twinkle = sin(time.mul(mix(float(11), float(22), s3)).add(s1.mul(60))).mul(0.28).add(0.86);
  const envelope = smoothstep(float(0.0), float(0.12), age).mul(smoothstep(float(1.0), float(0.45), age));
  const heat = mix(float(0.95), float(0.18), pow(age, 0.8));

  material.colorNode = blackbodyFireColor(heat).mul(mote).mul(envelope).mul(twinkle).mul(2.4);
  assignMaterialData(material, {
    roughness: 1,
    reactive: 0.9,
    reflectionClass: REFLECTION_CLASSES.NONE,
    bloomBoost: 0.55,
  });

  const sprite = new THREE.Sprite(material);
  sprite.count = count;
  sprite.frustumCulled = false;
  sprite.renderOrder = 3;
  return sprite;
}

/**
 * Airborne particles in a box that follows the camera: dust motes, spindrift,
 * ice crystals, embers. They brighten inside the carried lamp's reach, which is
 * what makes still air read as having volume.
 *
 * @param {object} profile a resolved `atmosphereProfiles.*.particles` entry; `outdoor` ones (snowfall,
 *   spindrift) fade out while the walker is under a roof, and `wisp` ones (the big haze sprites) are
 *   torn by that much (`tornDisc`) instead of drawn as plain discs
 */
export function createParticles(profile) {
  const size = profile.box;
  const index = instanceIndex.toFloat();
  // Integer-spaced seeds: fractional offsets of one index hash to correlated values and draw the field as a line.
  const seed = vec3(hash(index.mul(3)), hash(index.mul(3).add(1)), hash(index.mul(3).add(2)));
  const drift = vec3(...profile.velocity).mul(mix(float(0.5), float(1.5), hash(index.add(7919))));
  const sway = vec3(sin(time.mul(0.7).add(seed.x.mul(40))), sin(time.mul(0.9).add(seed.y.mul(40))),
    sin(time.mul(0.6).add(seed.z.mul(40)))).mul(profile.sway);
  // Wrapped relative to the camera so the box travels with it and no particle pops.
  const local = fract(seed.add(drift.mul(time).add(sway).sub(cameraPosition).div(size))).sub(0.5).mul(size);
  const world = cameraPosition.add(local);
  const material = new THREE.SpriteNodeMaterial({
    name: 'location-particles', depthWrite: false, fog: false,
    blending: profile.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  material.positionNode = world;
  material.scaleNode = vec2(mix(float(profile.size[0]), float(profile.size[1]), hash(index.add(15485))));
  let lamp = locationLight.carriedColor
    .mul(pow(smoothstep(0, max(locationLight.carriedRange, 1e-3), length(world.sub(locationLight.carriedPosition))).oneMinus(), 2.6))
    .mul(0.55);
  for (const slot of locationLight.dynamicLights) {
    const dynDist = length(world.sub(slot.position));
    const dynRange = max(slot.params.x, 1e-3);
    const dynFade = smoothstep(0, dynRange, dynDist).oneMinus();
    const nearPool = pow(smoothstep(0, max(dynRange.mul(0.42), 0.5), dynDist).oneMinus(), 3.0);
    lamp = lamp.add(slot.color.mul(pow(dynFade, 2.4).mul(0.26).add(nearPool.mul(0.68))));
  }
  const edge = smoothstep(0.35, 0.5, length(local.div(size))).oneMinus();
  const nearCamFade = smoothstep(float(0.35), float(1.1), length(local));
  const twinkle = profile.twinkle
    ? pow(sin(time.mul(mix(float(2), float(6), seed.x)).add(seed.y.mul(60))).mul(0.5).add(0.5), 6).mul(profile.twinkle).add(1)
    : float(1);
  const rawAmbientGain = profile.ambientGain ?? 6;
  const effectiveAmbientGain = !profile.outdoor && !(profile.glow > 0) && rawAmbientGain <= 1.0
    ? rawAmbientGain * 0.12
    : rawAmbientGain;
  material.colorNode = color(profile.color).mul(locationLight.ambientUp.mul(effectiveAmbientGain)
    .add(lamp.mul(profile.lampGain ?? 1)).add(profile.glow ?? 0)).mul(twinkle);
  const disc = profile.wisp > 0 ? tornDisc(1.8, seed.x, profile.wisp) : softDisc(1.8);
  let opacity = disc.mul(edge).mul(nearCamFade).mul(uniform(profile.opacity));
  if (profile.anchorPoint) {
    const { x, y, z } = profile.anchorPoint;
    opacity = opacity.mul(smoothstep(0, profile.anchorRadius, length(world.sub(vec3(x, y, z)))).oneMinus());
  }
  if (profile.outdoor) opacity = opacity.mul(locationLight.outdoors);
  material.opacityNode = opacity;
  const sprite = new THREE.Sprite(material);
  sprite.count = profile.count;
  sprite.frustumCulled = false;
  sprite.renderOrder = 3;
  return sprite;
}

/**
 * A shaft of light through hazy air: two crossed additive sheets from `from` to
 * `to`, widening to `width`. Stands in for volumetric light at a cave mouth. Its
 * streaks are the sky layer's wisp field (G) drifting through the beam, so it
 * reads as light in moving haze rather than ruled lines.
 */
export function createLightShaft({ from, to, width, tint, strength, softDepth = false }) {
  const a = new THREE.Vector3(from.x, from.y, from.z), b = new THREE.Vector3(to.x, to.y, to.z);
  const axis = b.clone().sub(a);
  const lengthMetres = axis.length();
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 8);
  const group = new THREE.Group();
  const material = new THREE.MeshBasicNodeMaterial({
    name: 'location-shaft', blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
    transparent: true,
  });
  const across = pow(smoothstep(0, 0.5, uv().x).mul(smoothstep(0.5, 1, uv().x).oneMinus()), 1.35);
  const along = smoothstep(0, 0.18, uv().y).mul(pow(uv().y.oneMinus(), 1.35).add(0.06));
  // Edge-on Fresnel fade eliminates hard vertical quad lines cutting across tunnels.
  const viewDir = normalize(cameraPosition.sub(positionWorld));
  const angleFade = pow(clamp(abs(dot(normalize(normalWorldGeometry), viewDir)), 0, 1), 1.6);
  const nearCamFade = smoothstep(float(1.2), float(4.2), length(cameraPosition.sub(positionWorld)));
  // Each shaft crosses its own patch of haze, picked by where it starts.
  const patch = vec2(from.x * 0.37, from.z * 0.37);
  const hazeA = noiseTap(uv().mul(vec2(SHAFT_HAZE.across, SHAFT_HAZE.along)).add(patch)
    .add(vec2(...SHAFT_HAZE.drift).mul(time)), 'sky').g;
  const hazeB = noiseTap(uv().mul(vec2(SHAFT_HAZE.across * 1.9, SHAFT_HAZE.along * 1.4)).sub(patch)
    .add(vec2(-SHAFT_HAZE.drift[0] * 0.7, SHAFT_HAZE.drift[1] * 1.3).mul(time)), 'sky').b;
  const streaks = mix(hazeA, hazeB, 0.42).sub(0.5).mul(SHAFT_HAZE.swing).add(0.85);
  let depthFade = float(1);
  if (softDepth) {
    const depthRange = cameraFar.sub(cameraNear);
    const beamDist = linearDepth().mul(depthRange).add(cameraNear);
    const sceneDist = linearDepth(viewportDepthTexture(viewportSafeUV(screenUV))).mul(depthRange).add(cameraNear);
    depthFade = smoothstep(float(0.05), float(1.8), sceneDist.sub(beamDist));
  }
  material.colorNode = color(tint).mul(across).mul(along).mul(angleFade).mul(nearCamFade).mul(depthFade).mul(streaks).mul(strength * 0.85);
  assignMaterialData(material, {
    roughness: 1,
    reactive: 1,
    reflectionClass: REFLECTION_CLASSES.NONE,
    bloomBoost: 0.25,
  });
  for (const roll of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const sheet = new THREE.Mesh(geometry, material);
    // PlaneGeometry's +Y runs along the shaft, source end at v = 1.
    sheet.scale.set(width, lengthMetres, 1);
    sheet.rotation.y = roll;
    sheet.position.y = -lengthMetres / 2;
    group.add(sheet);
  }
  group.position.copy(a);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), axis.normalize());
  group.renderOrder = 2;
  return group;
}
