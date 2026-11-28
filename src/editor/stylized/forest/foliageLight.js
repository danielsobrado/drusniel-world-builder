import * as THREE from 'three/webgpu';
import {
  cameraViewMatrix,
  clamp,
  faceDirection,
  float,
  fract,
  max,
  mix,
  normalMap,
  normalView,
  normalViewGeometry,
  normalWorld,
  positionGeometry,
  positionView,
  positionWorld,
  smoothstep,
  varying,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';
import { frameUniform as uniform } from '../../../render/FrameUniforms.js';
import { authoredTexture } from '../AuthoredTextureNode.js';
import { worldNoiseField } from '../worldNoise.js';
import { WORLD_NOISE_LAYERS, WORLD_NOISE_METERS } from '../worldNoiseLayout.js';
import { MEADOW_PATCH_METERS } from '../meadow/meadowColorNodes.js';
import { sampleWorldSurfaceContextAt } from '../worldSurfaceContext/WorldSurfaceContextState.js';
import { worldSurfaceAmbient } from '../worldSurfaceContext/WorldSurfaceAmbient.js';

/** Share of foliage vs woody-stem normals bent to the sky when puff normals are absent. */
const SKYWARD_FOLIAGE_NORMAL = 0.28;
const SKYWARD_WOODY_NORMAL = 0.10;
/** Strength of a plant's own normal map over the bent/puff normal. */
const UNDERSTORY_NORMAL_STRENGTH = 0.35;
/** Crown in-scatter: metres over which it ramps, and its share of the sky fill. */
const CROWN_AIR_START = 38;
const CROWN_AIR_END = 260;
const CROWN_AIR = 0.26;
/** Thicker air pulls the ramp in by the root of its fog scale, up to this factor. */
const MAX_AIR_REACH = 2.5;
/** Share of the sky fill a crown's and a trunk's shaded faces take. */
const CROWN_FILL = 0.48;
const BARK_FILL = 1.05;
/** Share of the ground's bounce light a downward/lower face takes. */
const CROWN_BOUNCE = 1.0;
const BARK_BOUNCE = 1.3;
/**
 * Stone takes several times bark's share: under this scene's thin ambient a backlit
 * boulder (atlas albedo ~0.25) otherwise renders as a black lump on bright ground.
 */
const ROCK_FILL = 3.5;
const ROCK_BOUNCE = 4;
// Understory now gets GPU puff normals + wrapped diffuse + rim glow, so keep
// ambient sky fill restrained to stay right in the meadow's saturation & value.
const UNDERSTORY_FILL = 0.88;
const UNDERSTORY_BOUNCE = 1.65;
const BLOSSOM_FILL = 1.15;
const BLOSSOM_BOUNCE = 1.4;
const BUILDING_FILL = 2.2;
/** Settlement paving's fill and bounce (`SettlementPavingMaterial`): the ground a town building stands on. */
export const PAVING_FILL = 1.35;
export const PAVING_BOUNCE = 0.8;
const BUILDING_BOUNCE = 2.6;
/**
 * Shared canopy-floor sky fill consumed identically by shaded forest terrain
 * (`terrainMaterial.js`), near grass blades (`meadowBladeMaterial.js`), and
 * far grass cards (`meadowCardMaterial.js`) so woodland blades and floor stay
 * in the exact same indirect light instead of inverting dark under canopy.
 */
export const FOREST_FLOOR_FILL = 0.62;
/**
 * The fill light the ground itself takes at a point, `albedo · sky · FOREST_FLOOR_FILL · canopy`:
 * the terrain, meadow blades and cards, and every object's foot inside its WSC contact band
 * (`applyWorldSurfaceContact().groundLight`), so a join is lit as one surface.
 */
export function groundFillLight(albedo, canopy) {
  return foliageSkyFill(albedo, FOREST_FLOOR_FILL).mul(canopy);
}

/** Metres up a trunk over which the bounce off the ground fades. */
const BOUNCE_REACH = 5;

/**
 * A restrained sky fill shared by crowns and understory, updated once a frame.
 * Direct transmission uses the scene light's colour, intensity and shadows.
 */
export const foliageLight = Object.freeze({
  /** Transmission gain, applied to already-shadowed direct radiance. */
  strength: uniform(0.28),
  /** Sky fill lifting the canopy's shaded interior. */
  fill: uniform(0.3),
  skyColor: uniform(new THREE.Color('#ffffff')),
  /**
   * Distance in-scatter: the scene fog's hue at the sky fill's level, so far crowns
   * lean to the horizon they stand against and not to the zenith (look bible, rule 4).
   */
  airColor: uniform(new THREE.Color('#ffffff')),
  /** The hemisphere's ground colour: light coming back up off the forest floor. */
  groundColor: uniform(new THREE.Color('#000000')),
  sunDirection: uniform(new THREE.Vector3(0, 1, 0)),
  /** Distance multiplier on the in-scatter ramp: humid regions haze their near trees. */
  airReach: uniform(1),
});

/**
 * Copies the hemisphere's linear colour and capped intensity into the fill.
 *
 * @param {{ directional?: THREE.DirectionalLight, hemisphere?: THREE.HemisphereLight } | null} sky
 * @param {?THREE.Color} fogColor the sky's own fog colour; without it the air keeps the sky colour
 */
export function syncFoliageLight(sky, fogColor = null) {
  const hemisphere = sky?.hemisphere;
  if (hemisphere) foliageLight.skyColor.value.copy(hemisphere.color);
  else foliageLight.skyColor.value.setRGB(0, 0, 0);
  const air = foliageLight.airColor.value.copy(foliageLight.skyColor.value);
  const fogLuminance = fogColor ? luminance(fogColor) : 0;
  // The fog's hue, the sky fill's energy: fog colour alone is over twice as bright.
  if (fogLuminance > 1e-4) air.copy(fogColor).multiplyScalar(luminance(foliageLight.skyColor.value) / fogLuminance);
  if (hemisphere) foliageLight.groundColor.value.copy(hemisphere.groundColor);
  else foliageLight.groundColor.value.setRGB(0, 0, 0);
  foliageLight.airReach.value = airReach(sky?.fogDensityScale);
  foliageLight.fill.value = Math.min(Math.max(hemisphere?.intensity ?? 0, 0) * 0.35, 0.7);
  // Light intensity and colour are already included in the lighting model.
  foliageLight.strength.value = sky?.directional ? 0.28 : 0;
  if (sky?.directional) foliageLight.sunDirection.value.copy(sky.directional.position)
    .sub(sky.directional.target.position).normalize();
}

export function airReach(fogDensityScale) {
  return Math.min(MAX_AIR_REACH, Math.max(1, Math.sqrt(Number.isFinite(fogDensityScale) ? fogDensityScale : 1)));
}

function luminance(colour) {
  return colour.r * 0.2126 + colour.g * 0.7152 + colour.b * 0.0722;
}

export function foliageSkyFill(color, amount) {
  return color.mul(foliageLight.skyColor).mul(foliageLight.fill).mul(amount);
}

/**
 * Lights green leaf groups smoothly like the meadow while keeping lower skyward
 * blend on woody stems and bark so internal shrub branches hold 3D shading contrast.
 * Call after applyPlantMotion, which may replace `normalNode`.
 */
export function applySkywardNormal(material) {
  const authored = material.normalNode ?? normalViewGeometry.mul(faceDirection);
  // Materials with 3D GPU puff normals already carry smooth volumetric shading;
  // double-bending them straight up aims every sunlit shrub into the noon sun.
  if (material.foliageShapeNormalNode) {
    material.normalNode = withAuthoredNormalMap(material, groundedNormal(material, authored));
    return material;
  }
  const up = cameraViewMatrix.mul(vec4(0, 1, 0, 0)).xyz;
  const sample = material.map
    ? authoredTexture(material.map).rgb
    : material.colorNode ?? null;
  const skywardBlend = sample
    ? mix(
      float(SKYWARD_WOODY_NORMAL),
      float(SKYWARD_FOLIAGE_NORMAL),
      clamp(sample.g.sub(max(sample.r, sample.b)).mul(8.0), 0.0, 1.0),
    )
    : float(SKYWARD_FOLIAGE_NORMAL);
  material.normalNode = withAuthoredNormalMap(material, groundedNormal(material, mix(authored, up, skywardBlend).normalize()));
  return material;
}

/**
 * A plant's foot shades as the ground it stands in: its view normal leans to the
 * terrain's. Stem cards stand vertical, so a high sun only grazed them and every
 * shrub stood on a black bar in sunlit grass (2026-11-24 captures).
 */
function groundedNormal(material, normal) {
  const ground = material.foliageGroundNormalNode;
  if (!ground) return normal;
  const groundView = cameraViewMatrix.mul(vec4(ground, 0)).xyz.normalize();
  return mix(normal, groundView, material.foliageGroundNormalWeightNode).normalize();
}

/**
 * A view normal with the material's own normal map laid back over it. Setting
 * `normalNode` stops a node material sampling its `normalMap`, so the bent normal
 * is perturbed here by the map's offset from the flat surface normal.
 */
export function withAuthoredNormalMap(material, geometricNormal) {
  if (!material.normalMap) return geometricNormal;
  const mapped = normalMap(authoredTexture(material.normalMap), vec2(UNDERSTORY_NORMAL_STRENGTH));
  return geometricNormal.add(mapped.sub(normalView)).normalize();
}

/**
 * Blends the global hemisphere ground bounce with the local resolved WSC terrain
 * reflectance so crown undersides pick up cobblestones, leaf litter, straw or snow.
 */
export function crownLocalGroundBounce(wscAlbedo, wscValidity, share = 0.7) {
  const local = wscAlbedo.mul(1.25).clamp(0.03, 0.85);
  return mix(foliageLight.groundColor, local, wscValidity.clamp(0, 1).mul(share));
}

/**
 * Surface-albedo indirect fill for a tree crown (sky fill + ground bounce).
 * Kept separate from distance/rim atmosphere so per-instance leaf tints
 * (biome hue, autumn colour) tint reflected foliage light without colouring the air.
 */
export function treeFoliageSurfaceEmission(crown, visibility = float(1), localGround = null) {
  const ground = localGround ?? foliageLight.groundColor;
  // Ground bounce lifts lower and underside puffs toward the local floor beneath the tree.
  const underside = normalWorld.y.negate().mul(0.5).add(0.5).clamp(0, 1).pow(1.6);
  // Restrained sky-fill floor preserves deep mossy interior shadows without washing into artificial cyan.
  const skyVis = mix(float(0.28), float(1), visibility);
  const coreTemp = mix(vec3(0.86, 0.96, 1.02), vec3(1, 1, 1), visibility);
  const skyTerm = foliageSkyFill(crown.mul(coreTemp), CROWN_FILL).mul(skyVis);
  return skyTerm
    .add(crown.mul(ground).mul(foliageLight.fill).mul(underside).mul(CROWN_BOUNCE).mul(mix(float(0.35), float(1), visibility)));
}

/**
 * Shared world-space painterly harmony for near 3D crowns, proxies, and impostors.
 * Combines per-tree temperature individuality, meadow macro-patch harmony, and
 * terrain/roof-scale world-space meso brushstrokes (cool blue-green to warm yellow-green).
 */
export function canopyPainterlyHarmony({
  canonicalXZ,
  worldPos,
  seed,
  label = 'crown',
}) {
  const treeTemp = mix(vec3(0.96, 1.005, 1.02), vec3(1.04, 1.00, 0.95), fract(seed.mul(7.31)));
  const macroPatch = varying(
    worldNoiseField(WORLD_NOISE_LAYERS.macro)(canonicalXZ.div(MEADOW_PATCH_METERS)).r,
    `${label}MacroPatch`,
  );
  const landscapeHarmony = mix(vec3(0.97, 1.005, 1.015), vec3(1.03, 1.005, 0.955), macroPatch);
  const worldCoord = varying(vec3(canonicalXZ.x, worldPos.y, canonicalXZ.y), `${label}WorldStroke`);
  const strokeUv = worldCoord.xz.add(vec2(worldCoord.y.mul(0.37), worldCoord.y.mul(-0.29)));
  const mesoA = worldNoiseField(WORLD_NOISE_LAYERS.meso)(strokeUv.div(WORLD_NOISE_METERS.meso));
  const mesoB = worldNoiseField(WORLD_NOISE_LAYERS.meso)(strokeUv.div(11.5).add(0.41));
  const stroke = mesoA.r.mul(0.55).add(mesoB.g.mul(0.45));
  const strokeTemp = mix(vec3(0.965, 0.995, 1.025), vec3(1.035, 1.015, 0.96), stroke);
  const strokeWeight = smoothstep(50, 18, positionView.length());
  return treeTemp.mul(landscapeHarmony).mul(mix(vec3(1), strokeTemp, strokeWeight));
}

/**
 * Untinted atmospheric in-scatter and sky-edge dissolve for a tree crown.
 * Never multiplied by per-instance leaf/autumn tint, so crowns fade cleanly
 * into the actual horizon fog and sky colour behind them.
 */
export function treeFoliageAtmosphereEmission(skyEdge = null) {
  const air = treeAir();
  const edge = skyEdge ?? float(0);
  // Blend rim atmosphere from horizon mist (sides/lower) to sky (upper crown) to avoid blue halos against hills.
  const edgeColor = mix(foliageLight.airColor, foliageLight.skyColor, normalWorld.y.clamp(0, 1));
  const airShadeWeight = mix(float(1.1), float(0.85), normalWorld.y.mul(0.5).add(0.5).clamp(0, 1));
  return foliageLight.airColor.mul(foliageLight.fill).mul(air).mul(airShadeWeight)
    .add(edgeColor.mul(foliageLight.fill).mul(edge));
}

/**
 * Combined sky fill, ground bounce, and atmospheric in-scatter for paths that
 * already carry their final tinted crown albedo (such as impostors).
 */
export function treeFoliageEmission(crown, skyEdge = null, visibility = float(1), localGround = null) {
  return treeFoliageSurfaceEmission(crown, visibility, localGround)
    .add(treeFoliageAtmosphereEmission(skyEdge));
}

function treeAir() {
  return smoothstep(CROWN_AIR_START, CROWN_AIR_END, positionView.length().mul(foliageLight.airReach)).mul(CROWN_AIR);
}

/**
 * The same air and fill on bark, and the floor's own light on its lower faces: lit
 * only by the sun and a thin ambient, a shaded trunk is a black bar in a green wood.
 */
/**
 * The sky share and ground bounce a receiver at this point gets (WSC PR 9): the
 * canopy and contact over it dim the sky fill, the ground beside it colours the
 * bounce. Outside the WSC window it is the plain hemisphere (`worldSurfaceAmbient`).
 */
function receiverAmbient(enabled, label) {
  if (!enabled) return { skyVisibility: float(1), groundBounce: foliageLight.groundColor };
  // Per vertex, packed into one varying: these materials already carry several, and
  // the WSC sample's own three would push them toward the inter-stage limit.
  const ambient = worldSurfaceAmbient(sampleWorldSurfaceContextAt(positionWorld.xz), foliageLight.groundColor);
  const packed = varying(vec4(ambient.groundBounce, ambient.skyVisibility), label);
  return { skyVisibility: packed.w, groundBounce: packed.xyz };
}

export function treeBarkEmission(bark, { height = positionGeometry.y, up = normalWorld.y, ambient = true } = {}) {
  const low = smoothstep(0, BOUNCE_REACH, height).oneMinus();
  const facing = up.negate().mul(0.5).add(0.5);
  const { skyVisibility, groundBounce } = receiverAmbient(ambient, 'barkAmbient');
  return foliageSkyFill(bark, BARK_FILL).mul(skyVisibility)
    .add(bark.mul(groundBounce).mul(foliageLight.fill).mul(facing).mul(low).mul(BARK_BOUNCE))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}

/**
 * Sky fill and floor bounce for scattered stones, attenuated on bright snow cover so
 * caps keep crisp shading, and by the canopy and contact over the stone (`DEF-10`:
 * a boulder under a closed wood no longer glows like one in a meadow).
 */
export function rockShadeEmission(stone, { snowCover = null, ambient = true } = {}) {
  const facing = normalWorld.y.negate().mul(0.5).add(0.5);
  const fillGain = snowCover ? mix(float(ROCK_FILL), float(0.42), snowCover.clamp(0, 1)) : float(ROCK_FILL);
  const bounceGain = snowCover ? mix(float(ROCK_BOUNCE), float(0.55), snowCover.clamp(0, 1)) : float(ROCK_BOUNCE);
  const { skyVisibility, groundBounce } = receiverAmbient(ambient, 'rockAmbient');
  return foliageSkyFill(stone, fillGain).mul(skyVisibility)
    .add(stone.mul(groundBounce).mul(foliageLight.fill).mul(facing).mul(bounceGain))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}

/**
 * Sky fill, ground-colour bounce and distance air in-scatter for understory plants,
 * shrubs and bush proxies so they sit in the same light and horizon haze as stones.
 *
 * The bounce is the WSC ground beside the plant (PR 9), as on stones and bark. Its
 * sky share is not dimmed by the canopy here: a plant at knee height lives in the
 * floor's light, and its contact's `groundLight` caps the fill at the floor's under a
 * canopy. Dimming it as well left shrubs at a fifth of the floor's fill, black blots.
 */
export function understoryShadeEmission(plant, { blossom = false, airRim = null, ambient = true } = {}) {
  const fill = blossom ? BLOSSOM_FILL : UNDERSTORY_FILL;
  const bounce = blossom ? BLOSSOM_BOUNCE : UNDERSTORY_BOUNCE;
  const facing = normalWorld.y.negate().mul(0.5).add(0.5).clamp(0, 1);
  const edge = airRim ?? float(0);
  const rimColor = mix(foliageLight.airColor, foliageLight.skyColor, smoothstep(0.1, 0.85, normalWorld.y));
  const { groundBounce } = receiverAmbient(ambient, 'understoryAmbient');
  return foliageSkyFill(plant, fill)
    .add(plant.mul(groundBounce).mul(foliageLight.fill).mul(facing).mul(bounce))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()))
    .add(rimColor.mul(foliageLight.fill).mul(edge));
}

/**
 * Shared sky fill, warm ground bounce and distance air in-scatter for settlements,
 * workshop buildings and placed structures so masonry, plaster, timber and roofs
 * share the soft-shaded atmospheric integration of the terrain's boulders.
 */
/** The light paving takes where it lies flat (no bounce faces down onto it): the ground light at a town wall's foot. */
export function pavingGroundFill(albedo) {
  return foliageSkyFill(albedo, PAVING_FILL).add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}

/** `ambient: false` keeps the plain hemisphere, for far stand-ins outside any WSC window. */
export function buildingShadeEmission(surface, { fill = BUILDING_FILL, bounce = BUILDING_BOUNCE, snowCover = null, ambient = true } = {}) {
  const facing = normalWorld.y.negate().mul(0.5).add(0.5);
  const fillGain = snowCover ? mix(float(fill), float(0.45), snowCover.clamp(0, 1)) : float(fill);
  const bounceGain = snowCover ? mix(float(bounce), float(0.55), snowCover.clamp(0, 1)) : float(bounce);
  // Spatial ambient as on stones (PR 9): a wall under trees loses sky, and the ground it
  // stands on (paving, soil, snow) colours the bounce.
  const { skyVisibility, groundBounce } = receiverAmbient(ambient, 'buildingAmbient');
  return foliageSkyFill(surface, fillGain).mul(skyVisibility)
    .add(surface.mul(groundBounce).mul(foliageLight.fill).mul(facing).mul(bounceGain))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}
