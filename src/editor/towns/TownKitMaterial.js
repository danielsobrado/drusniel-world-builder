import * as THREE from 'three/webgpu';
import {
  Fn,
  If,
  attribute,
  clamp,
  dot,
  float,
  instanceColor,
  int,
  mix,
  modelWorldMatrix,
  mx_noise_float,
  normalMap,
  normalWorld,
  parallaxDirection,
  positionGeometry,
  positionLocal,
  sin,
  smoothstep,
  texture,
  time,
  uniform,
  uniformArray,
  uv,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { sampleWorldWind } from '../weather/wind/worldWindState.js';
import { KIT_DATA_ATTRIBUTE } from './TownKitGeometry.js';
import { RENDER_PALETTE, ROLE, surfaceOf } from './TownKitSurfaces.js';

/**
 * The one material every opaque town surface draws with.
 *
 * Each vertex names its kit material (TownKitGeometry's kitData.z); the shader
 * looks that row up in small uniform tables and samples the atlas's albedo and
 * normal array layers. A town's look (skin, render finish, banner colour, snow,
 * ashlar or thatch swaps) only changes table values, so every look shares one
 * pipeline.
 *
 * On top of the authored kit:
 *  - per building, from the instance seed (instanceColor, 0.9..1 per channel):
 *    render tone picked from a warm palette, darker or paler timber, roof tone;
 *  - relief (TownKitSurfaces): strengthened normal maps, crevices darkened from
 *    the normal maps, and parallax so stones and slates stand proud;
 *  - per place, from town-space noise: broad tone drift, render worn back to
 *    the stone beneath, moss on sky-facing stone and slate;
 *  - snow on sky-facing stone, timber and roof in frost towns;
 *  - banners and awnings sway in the world wind;
 *  - a few centimetres of town-space wobble, so long ridges, beams and walls are
 *    never ruler-straight. It is continuous across modules because it depends on
 *    position only.
 */

const SNOW = vec3(0.9, 0.93, 0.98);
const MOSS = vec3(0.24, 0.3, 0.12);

export const townKitShared = Object.freeze({
  /** Sun elevation in radians, written each frame by the town runtime. */
  sunElevation: uniform(0.7),
  /** Albedo grade over the scans: brightness lift, saturation, crevice depth, relief. */
  // Tuned in-game at Wyle under the storybook sky (tmp/town-grade-tune.mjs):
  // the scans are photographed flat and dim; this lifts them to the reference's
  // sunlit stone while the crevices keep the joints deep.
  albedoLift: uniform(1.3),
  saturation: uniform(1.1),
  creviceDepth: uniform(0.45),
  reliefScale: uniform(1.25),
});

function seedChannels() {
  return clamp(instanceColor.sub(0.9).mul(10), 0, 1);
}

/**
 * Smooth, non-repeating-looking warp from a few incommensurate sines: far
 * cheaper than gradient noise, which matters here because it runs per vertex in
 * every shadow cascade too.
 */
function wobble(position) {
  const a = sin(position.x.mul(0.31).add(position.z.mul(0.17)).add(sin(position.z.mul(0.23)).mul(1.7)));
  const b = sin(position.z.mul(0.29).sub(position.x.mul(0.13)).add(sin(position.x.mul(0.19)).mul(1.9)));
  const c = sin(position.y.mul(0.37).add(position.x.mul(0.11)));
  return vec3(a.mul(0.04), a.mul(c).mul(0.012), b.mul(0.04));
}

/** Cloth in the world wind; only vertices with a sway weight pay for the wind fetch. */
const swayOffset = Fn(([weight]) => {
  const offset = vec3(0).toVar();
  If(weight.greaterThan(0.001), () => {
    // The wind field is in render space; positionLocal here is town space (after instancing).
    const world = sampleWorldWind(modelWorldMatrix.mul(vec4(positionLocal, 1)).xz);
    const phase = positionGeometry.y.mul(2.3).add(positionLocal.x.mul(0.7)).add(positionLocal.z.mul(0.5));
    const flutter = sin(time.mul(2.6).add(phase)).mul(0.6).add(sin(time.mul(4.1).add(phase.mul(1.7))).mul(0.25));
    const strength = world.envelope.clamp(0.4, 3).mul(0.07).mul(weight);
    offset.assign(vec3(world.direction.x, 0, world.direction.y).mul(strength.mul(flutter.add(0.8))));
  });
  return offset;
});

/**
 * @param {import('./TownKitAtlas.js').TownKitAtlas} atlas
 * @param {object} look resolved look (TownMaterialPalette.resolveLook)
 */
export function createTownKitMaterial(atlas, look) {
  const count = Math.max(1, atlas.rows.length);
  const table = () => uniformArray(new Array(count).fill(0).map(() => new THREE.Vector4()), 'vec4');
  const layers = table();
  const tints = table();
  const kinds = table();
  const relief = table();
  const snow = uniform(0);
  const material = new THREE.MeshStandardNodeMaterial({ name: `TownKit ${look.key}` });
  // The kit has open panes (lunettes, oriel facets, roof cheeks) authored one-sided.
  material.side = THREE.DoubleSide;
  material.userData.townKit = { layers, tints, kinds, relief, snow };
  writeLook(material, atlas, look);

  const data = attribute(KIT_DATA_ATTRIBUTE, 'vec4');
  const id = int(data.z.add(0.5));
  const row = layers.element(id);
  const tint = tints.element(id);
  const kind = kinds.element(id);
  const surface = relief.element(id);
  const role = kind.x;
  const isRole = (value) => float(1).sub(clamp(role.sub(value).abs(), 0, 1));
  const seed = seedChannels();
  const place = positionLocal;

  material.positionNode = positionLocal.add(wobble(positionLocal)).add(swayOffset(data.y));
  // Shadow cascades re-run the vertex stage for every town vertex: they get the
  // plain position (a few centimetres of wobble never shows in a shadow).
  material.castShadowPositionNode = positionLocal;

  // Parallax: lift pale faces (stones, slates) above dark joints.
  const base = uv();
  const height = dot(texture(atlas.albedo, base).depth(row.x).rgb, vec3(0.3, 0.55, 0.15));
  const st = base.sub(parallaxDirection.xy.mul(height.sub(0.45).mul(surface.z).mul(townKitShared.reliefScale)));
  const sample = texture(atlas.albedo, st).depth(row.x).rgb;
  const normalSample = texture(atlas.normal, st).depth(row.y).rgb;
  // Crevices from the normal map: the further a texel tilts, the deeper the joint.
  const crevice = smoothstep(0.97, 0.72, normalSample.z).mul(surface.y);
  const luma = dot(sample, vec3(0.3, 0.55, 0.15));
  // Slightly richer than the scans' flat daylight albedo, and lifted a touch.
  const rich = mix(vec3(luma), sample, townKitShared.saturation).mul(townKitShared.albedoLift).mul(surface.w).max(0);
  const authored = rich.mul(tint.rgb).mul(float(1).sub(crevice.mul(townKitShared.creviceDepth)));

  // Render worn back to the stone beneath, in irregular town-space patches.
  const wearNoise = mx_noise_float(place.mul(0.55));
  const wearMask = isRole(ROLE.plaster).mul(kind.w);
  const wear = smoothstep(0.44, 0.5, wearNoise).mul(wearMask);
  const rim = smoothstep(0.38, 0.44, wearNoise).mul(wearMask);
  const stoneBeneath = texture(atlas.albedo, st.mul(1.3)).depth(kind.z).rgb.mul(0.9);
  let colour = mix(authored, authored.mul(0.8), rim.sub(wear).clamp(0, 1));
  colour = mix(colour, stoneBeneath, wear);

  // Per building: render palette, timber and roof tone.
  const pick = seed.x.mul(RENDER_PALETTE.length - 0.001).floor();
  let renderTint = vec3(...RENDER_PALETTE[0]);
  for (let i = 1; i < RENDER_PALETTE.length; i += 1) {
    renderTint = mix(renderTint, vec3(...RENDER_PALETTE[i]), float(1).sub(clamp(pick.sub(i).abs(), 0, 1)));
  }
  const houseTint = mix(vec3(1), renderTint, isRole(ROLE.plaster))
    .mul(mix(float(1), mix(float(0.82), float(1.1), seed.y), isRole(ROLE.timber)))
    .mul(mix(float(1), mix(float(0.9), float(1.1), seed.z), isRole(ROLE.roof)));
  // Broad drift so long walls and roofs are never one flat tone.
  const drift = mx_noise_float(place.mul(0.09)).mul(0.08).add(1);
  colour = colour.mul(houseTint).mul(drift).mul(data.x);

  const up = normalWorld.y;
  const mossy = smoothstep(0.25, 0.8, up).mul(smoothstep(0.1, 0.45, drift.sub(1).mul(12)))
    .mul(isRole(ROLE.stone).add(isRole(ROLE.roof)).clamp(0, 1)).mul(0.3);
  colour = mix(colour, MOSS.mul(data.x), mossy);
  const snowCover = smoothstep(0.38, 0.72, up).mul(snow).mul(kind.y);
  colour = mix(colour, SNOW.mul(data.x.mul(0.3).add(0.7)), snowCover);

  material.colorNode = vec4(colour, 1);
  const strength = surface.x.mul(townKitShared.reliefScale).mul(float(1).sub(snowCover.mul(0.7)));
  material.normalNode = normalMap(normalSample, vec2(strength));
  material.roughnessNode = mix(row.z, float(0.62), snowCover).add(wear.mul(0.05)).add(crevice.mul(0.08));
  material.metalnessNode = mix(row.w, float(0), snowCover);
  material.emissiveNode = sample.mul(tint.rgb).mul(tint.w);
  return material;
}

/** Writes a look's table values into a town material (no recompilation). */
export function writeLook(material, atlas, look) {
  const { layers, tints, kinds, relief, snow } = material.userData.townKit;
  const stoneLayer = atlas.albedoLayer('M_stone');
  for (const row of atlas.rows) {
    const surface = surfaceOf(row.name);
    const role = surface.role;
    const swap = look.swaps[row.name] ? atlas.row(look.swaps[row.name]) : null;
    const source = swap ?? row;
    const tint = look.tints[row.name] ?? [1, 1, 1];
    const base = role === ROLE.banner ? [1, 1, 1] : source.color;
    layers.array[row.index].set(source.albedoLayer, source.normalLayer, source.roughness, source.metalness);
    tints.array[row.index].set(base[0] * tint[0], base[1] * tint[1], base[2] * tint[2], row.emissive);
    const snowy = role === ROLE.stone || role === ROLE.timber || role === ROLE.roof ? 1 : 0;
    kinds.array[row.index].set(role, snowy, stoneLayer, role === ROLE.plaster ? look.wear : 0);
    const shaped = surfaceOf(source.name);
    relief.array[row.index].set(shaped.normal, shaped.cavity, shaped.parallax, shaped.gain);
  }
  snow.value = look.snow;
}
