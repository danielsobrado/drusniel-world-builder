import * as THREE from 'three/webgpu';
import {
  cameraViewMatrix,
  clamp,
  faceDirection,
  float,
  max,
  mix,
  normalMap,
  normalView,
  normalViewGeometry,
  normalWorld,
  positionGeometry,
  positionView,
  smoothstep,
  vec2,
  vec4,
} from 'three/tsl';
import { frameUniform as uniform } from '../../../render/FrameUniforms.js';
import { authoredTexture } from '../AuthoredTextureNode.js';

/** Share of foliage vs woody-stem normals bent to the sky when puff normals are absent. */
const SKYWARD_FOLIAGE_NORMAL = 0.28;
const SKYWARD_WOODY_NORMAL = 0.10;
/** Strength of a plant's own normal map over the bent/puff normal. */
const UNDERSTORY_NORMAL_STRENGTH = 0.35;
/** Crown in-scatter: metres over which it ramps, and its share of the sky fill. */
const CROWN_AIR_START = 10;
const CROWN_AIR_END = 220;
const CROWN_AIR = 0.48;
/** Thicker air pulls the ramp in by the root of its fog scale, up to this factor. */
const MAX_AIR_REACH = 2.5;
/** Share of the sky fill a crown's and a trunk's shaded faces take. */
const CROWN_FILL = 0.86;
const BARK_FILL = 1.05;
/** Share of the ground's bounce light a downward/lower face takes. */
const CROWN_BOUNCE = 1.45;
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
const BUILDING_BOUNCE = 2.6;
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
    material.normalNode = withAuthoredNormalMap(material, authored);
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
  material.normalNode = withAuthoredNormalMap(material, mix(authored, up, skywardBlend).normalize());
  return material;
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
 * Only sky fill is emissive; sunlight must pass through the shadow system.
 * The added air lifts shaded leaves toward the sky behind them: exp² fog is still
 * near zero at the treeline, where crowns otherwise cut out of the sky.
 */
export function treeFoliageEmission(crown, skyEdge = null, visibility = float(1)) {
  const air = treeAir();
  const edge = skyEdge ?? float(0);
  // Broadened ground bounce lifts lower and side-facing puffs toward the meadow floor.
  const underside = normalWorld.y.negate().mul(0.5).add(0.5).clamp(0, 1).pow(1.4);
  // Blend rim atmosphere from horizon mist (sides/lower) to sky (upper crown) to avoid blue halos against hills.
  const edgeColor = mix(foliageLight.airColor, foliageLight.skyColor, normalWorld.y.clamp(0, 1));
  const airShadeWeight = mix(float(1.15), float(0.85), normalWorld.y.mul(0.5).add(0.5).clamp(0, 1));
  return foliageSkyFill(crown, CROWN_FILL).mul(visibility)
    .add(crown.mul(foliageLight.groundColor).mul(foliageLight.fill).mul(underside).mul(CROWN_BOUNCE).mul(visibility))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(air).mul(airShadeWeight))
    .add(edgeColor.mul(foliageLight.fill).mul(edge));
}

function treeAir() {
  return smoothstep(CROWN_AIR_START, CROWN_AIR_END, positionView.length().mul(foliageLight.airReach)).mul(CROWN_AIR);
}

/**
 * The same air and fill on bark, and the floor's own light on its lower faces: lit
 * only by the sun and a thin ambient, a shaded trunk is a black bar in a green wood.
 */
export function treeBarkEmission(bark, { height = positionGeometry.y, up = normalWorld.y } = {}) {
  const low = smoothstep(0, BOUNCE_REACH, height).oneMinus();
  const facing = up.negate().mul(0.5).add(0.5);
  return foliageSkyFill(bark, BARK_FILL)
    .add(bark.mul(foliageLight.groundColor).mul(foliageLight.fill).mul(facing).mul(low).mul(BARK_BOUNCE))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}

/** Sky fill and floor bounce for scattered stones, which sit wholly in the bounce. */
export function rockShadeEmission(stone) {
  const facing = normalWorld.y.negate().mul(0.5).add(0.5);
  return foliageSkyFill(stone, ROCK_FILL)
    .add(stone.mul(foliageLight.groundColor).mul(foliageLight.fill).mul(facing).mul(ROCK_BOUNCE))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}

/**
 * Sky fill, ground-colour bounce and distance air in-scatter for understory plants,
 * shrubs and bush proxies so they sit in the same light and horizon haze as stones.
 */
export function understoryShadeEmission(plant, { blossom = false, airRim = null } = {}) {
  const fill = blossom ? BLOSSOM_FILL : UNDERSTORY_FILL;
  const bounce = blossom ? BLOSSOM_BOUNCE : UNDERSTORY_BOUNCE;
  const facing = normalWorld.y.negate().mul(0.5).add(0.5).clamp(0, 1);
  const edge = airRim ?? float(0);
  const rimColor = mix(foliageLight.airColor, foliageLight.skyColor, smoothstep(0.1, 0.85, normalWorld.y));
  return foliageSkyFill(plant, fill)
    .add(plant.mul(foliageLight.groundColor).mul(foliageLight.fill).mul(facing).mul(bounce))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()))
    .add(rimColor.mul(foliageLight.fill).mul(edge));
}

/**
 * Shared sky fill, warm ground bounce and distance air in-scatter for settlements,
 * workshop buildings and placed structures so masonry, plaster, timber and roofs
 * share the soft-shaded atmospheric integration of the terrain's boulders.
 */
export function buildingShadeEmission(surface, { fill = BUILDING_FILL, bounce = BUILDING_BOUNCE } = {}) {
  const facing = normalWorld.y.negate().mul(0.5).add(0.5);
  return foliageSkyFill(surface, fill)
    .add(surface.mul(foliageLight.groundColor).mul(foliageLight.fill).mul(facing).mul(bounce))
    .add(foliageLight.airColor.mul(foliageLight.fill).mul(treeAir()));
}
