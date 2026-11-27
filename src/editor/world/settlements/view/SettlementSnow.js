import {
  attribute, clamp, float, materialColor, materialNormal, materialRoughness, mix, mx_noise_float, normalGeometry,
  normalWorldGeometry, positionGeometry, positionWorld, smoothstep, vec3,
} from 'three/tsl';
import { blendCoat } from '../../../../render/materials/surfaceLayers/PbrCoatBlend.js';
import { snowCoat } from '../../../stylized/surfaceCoatings/SnowCoat.js';
import { surfaceCoatings } from '../../../stylized/surfaceCoatings/SurfaceCoatingConfig.js';
import { snowLightUniforms } from '../../../stylized/sky/skyLight.js';
import { publishCoatCoverage } from '../../../stylized/surfaceCoatings/CoatCoverage.js';

/** Families that hold snow: everything solid. Glass and the dark recesses behind openings do not. */
const SNOWY_SLOTS = Object.freeze(new Set(['roof', 'stone', 'wood', 'mortar', 'metal']));
const SNOW = vec3(0.95, 0.96, 0.98);
/** Snow in a crease or on a narrow ledge settles a little bluer and darker. */
const SNOW_SHADE = vec3(0.8, 0.85, 0.93);
/**
 * Where snow takes hold, by how far a face turns up. Roofs hold it far steeper
 * than ledges do: at the ledge band a 45-50 degree roof only caught a grey film
 * through which every slate still showed.
 */
const HOLD = Object.freeze({ roof: [0.18, 0.42], other: [0.42, 0.68] });
/** How far up the hold band climbs as snow thins: a light fall lies only on the flattest faces. */
const THIN_LIFT = 0.45;
/** Snow's roughness when the snow coat is off. */
const PLAIN_ROUGHNESS = 0.62;

/**
 * Snow lying on a town in snow country: every face turned up — roofs, ledges,
 * beams, rails, sills — carries a soft-edged cap, as Community Shaders' snow
 * cover lays it over Skyrim's towns. How much snow is the instance's own
 * (`instanceBiomeLook.w`, the biome's ground snow at the town), so one pooled
 * variant stands bare in a meadow town and snowed-in on the tundra. Less snow
 * covers fewer faces, each fully, rather than every face in a grey film.
 *
 * Faces turned down get none, so eaves, porch roofs and overhangs shelter what
 * is under them for free; vertical walls keep only a dusting in their relief.
 * The cap is the terrain's Snow007C coat (SnowCoat): its own grain, cavities,
 * roughness and normals over the slates, stones and beams beneath.
 *
 * @param {object} material a graded workshop material
 * @param {string} slot its material family
 */
export function snowSettlementMaterial(material, slot, settings = surfaceCoatings()) {
  if (!SNOWY_SLOTS.has(slot)) return;
  const amount = clamp(attribute('instanceBiomeLook', 'vec4').w.mul(1.4), 0, 1);
  // Broken edge: snow thins first where a face tips toward vertical, in drifts.
  const drift = mx_noise_float(positionWorld.mul(0.9)).mul(0.5).add(0.5);
  const fine = mx_noise_float(positionWorld.mul(5.3)).mul(0.5).add(0.5);
  // The geometric normal: a slate's or a stone's normal-map bump must not speckle the cap.
  const facing = normalWorldGeometry.y;
  const up = facing.add(drift.sub(0.5).mul(0.35)).add(fine.sub(0.5).mul(0.12));
  const [from, to] = HOLD[slot] ?? HOLD.other;
  const lift = amount.oneMinus().mul(THIN_LIFT);
  const cover = smoothstep(lift.add(from), lift.add(to), up).mul(smoothstep(0, 0.12, amount)).toVar('settlementSnow');
  const coat = snowCoat(positionGeometry, normalGeometry, cover, settings);
  const shadeFill = mix(snowLightUniforms.shadeTint, vec3(1, 1, 1), smoothstep(from, to + 0.3, facing));
  const snow = mix(SNOW_SHADE, SNOW, smoothstep(from, to + 0.3, facing).mul(fine.mul(0.25).add(0.75)))
    .mul(shadeFill)
    .mul(snowLightUniforms.brightness.max(0.84))
    .mul(coat?.tint ?? vec3(1));
  const snowRoughness = settings.snow.enabled ? float(settings.snow.roughness).add(coat?.roughness ?? 0) : PLAIN_ROUGHNESS;
  const metal = Boolean(material.metalnessNode || material.metalness > 0);
  const baseNormal = material.normalNode ?? materialNormal;
  const surface = blendCoat({
    color: material.colorNode ?? materialColor,
    roughness: material.roughnessNode ?? materialRoughness,
    metalness: metal ? material.metalnessNode ?? float(material.metalness) : undefined,
    normal: baseNormal,
  }, { color: snow, roughness: snowRoughness, metalness: float(0), normal: coat?.normal() }, cover);
  material.colorNode = surface.color;
  material.roughnessNode = surface.roughness;
  if (metal) material.metalnessNode = surface.metalness;
  if (surface.normal !== baseNormal) material.normalNode = surface.normal;
  publishCoatCoverage(material, { snow: cover });
  // Restrain heavy stone/timber sky-fill bounce where bright snow covers roofs and ledges.
  if (material.emissiveNode) material.emissiveNode = material.emissiveNode.mul(mix(float(1), float(0.28), cover));
}
