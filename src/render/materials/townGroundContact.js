import { Fn, If, float, mix, positionGeometry, positionWorld, varying, vec3, vec4 } from 'three/tsl';
import { sampleWorldSurfaceContextAt } from '../../editor/stylized/worldSurfaceContext/WorldSurfaceContextState.js';
import { applyWorldSurfaceContact } from '../../editor/stylized/worldSurfaceContext/WorldSurfaceContactNodes.js';

/**
 * Settlement ground from the World Surface Context (WSC PR 7): a town's earth
 * and the foot of its walls take their tone from the terrain they stand on
 * instead of one static `TOWN_GROUND` for every biome (`DEF-13`).
 *
 * Next to a house the terrain is usually meadow, and green earth reads wrong,
 * so the terrain albedo is turned into a soil: mostly grey, warmed to an earth
 * hue, and pulled halfway (in log luminance) toward `TOWN_GROUND`'s value. A
 * meadow town gets dark rich earth, a desert town sand, a road tile the
 * terrain's own path earth. Outside the WSC window it is `TOWN_GROUND` again.
 */
export const TOWN_GROUND = Object.freeze([0.47, 0.41, 0.33]);

const LUMA = Object.freeze([0.3, 0.55, 0.15]);
/** Earth hue, normalised to unit luma. */
const EARTH_HUE = (() => {
  const hue = [1.3, 1.0, 0.68];
  const luma = hue[0] * LUMA[0] + hue[1] * LUMA[1] + hue[2] * LUMA[2];
  return Object.freeze(hue.map(channel => channel / luma));
})();
/** How much of the terrain's own chroma a soil keeps. */
const SOIL_CHROMA = 0.25;
const GROUND_LUMA = TOWN_GROUND[0] * LUMA[0] + TOWN_GROUND[1] * LUMA[1] + TOWN_GROUND[2] * LUMA[2];
/** Geometry height above a building's ground line below which its vertices read the WSC. */
const FOUNDATION_REACH_METERS = 2.5;

/** CPU twin of `townSoilNode`, linear RGB in and out. */
export function townSoil(albedo) {
  const luma = albedo[0] * LUMA[0] + albedo[1] * LUMA[1] + albedo[2] * LUMA[2];
  const lift = Math.sqrt(GROUND_LUMA / Math.max(luma, 0.05));
  return albedo.map((channel, i) => (luma + (channel - luma) * SOIL_CHROMA) * EARTH_HUE[i] * lift);
}

/** The soil a terrain albedo node stands for (see `townSoil`). */
export function townSoilNode(albedo) {
  const luma = albedo.dot(vec3(...LUMA));
  const lift = float(GROUND_LUMA).div(luma.max(0.05)).sqrt();
  return mix(vec3(luma), albedo, SOIL_CHROMA).mul(vec3(...EARTH_HUE)).mul(lift);
}

/** The town's earth at this vertex, faded to `TOWN_GROUND` outside the WSC window. */
export function townEarthNode(prefix = 'townEarth') {
  const wsc = sampleWorldSurfaceContextAt(positionWorld.xz, { includeEco: false });
  const soil = varying(vec4(townSoilNode(wsc.albedo), wsc.validity), `${prefix}Soil`);
  return mix(vec3(...TOWN_GROUND), soil.xyz, soil.w.clamp(0, 1));
}

/**
 * A building's foot meeting its ground: the `foundation` contact profile laid
 * over the wall's own colour, following the terrain's height (so the band runs
 * with a slope) in the soil of the terrain at its foot. Only vertices within
 * `FOUNDATION_REACH_METERS` of the ground line read the WSC; above, the band is
 * gone anyway.
 *
 * @param {object} surface `{ color, roughness }` nodes
 * @param {object} options
 * @param {object} options.height metres above the building's ground line (geometry frame)
 * @param {object} [options.noise] centred noise in [-0.5, 0.5], stable per building
 */
export function groundTownFoundation(surface, { height = positionGeometry.y, noise = null } = {}) {
  // One vertex-stage branch packs the soil (already faded to TOWN_GROUND by WSC
  // validity) and the height above the ground (the terrain's where valid, the
  // geometry's ground line elsewhere) into one varying.
  const packed = Fn(() => {
    // Hoisted: a world position first emitted inside the branch would leave other users of it unset above it.
    const world = positionWorld.toVar('townFootWorld');
    const out = vec4(...TOWN_GROUND, height).toVar('townFootGround');
    If(height.lessThan(FOUNDATION_REACH_METERS), () => {
      const wsc = sampleWorldSurfaceContextAt(world.xz, { includeEco: false });
      const validity = wsc.validity.clamp(0, 1);
      out.assign(vec4(
        mix(vec3(...TOWN_GROUND), townSoilNode(wsc.albedo), validity),
        mix(height, world.y.sub(wsc.height), validity),
      ));
    });
    return out;
  })();
  const ground = varying(packed, 'townFootGround');
  return applyWorldSurfaceContact({
    surface,
    // Height and soil already resolved per vertex: the helper sees a valid sample at height 0.
    wsc: { height: float(0), validity: float(1), albedo: ground.xyz, contact: float(0) },
    worldY: ground.w,
    profile: 'foundation',
    noiseOffset: noise,
  });
}
