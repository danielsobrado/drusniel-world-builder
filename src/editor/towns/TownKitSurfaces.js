/**
 * How each kit surface is shaded by TownKitMaterial: its role (what a town's
 * skin tints and which per-building variation applies) and its relief.
 *
 * Relief is what makes walls read as built rather than printed:
 *   normal    normal-map strength (scans are subtle at 1x under a low sun)
 *   cavity    how dark the crevices the normal map describes get — mortar
 *             joints, slate laps and plank seams — baked into albedo
 *   parallax  parallax-offset depth in texture tiles; height is the albedo's
 *             own brightness, which for stone, slate and cobbles is a fair
 *             stand-in (faces are pale, joints dark)
 *   gain      albedo gain for scans photographed darker than the look wants
 *             (glTF colour factors cannot exceed 1)
 * Pure data.
 */

export const ROLE = Object.freeze({ other: 0, stone: 1, timber: 2, roof: 3, plaster: 4, banner: 5 });

const DEFAULT = Object.freeze({ role: ROLE.other, normal: 1, cavity: 0.2, parallax: 0, gain: 1 });

export const SURFACES = Object.freeze({
  M_stone: { role: ROLE.stone, normal: 2.2, cavity: 0.75, parallax: 0.035 },
  M_stone_ashlar: { role: ROLE.stone, normal: 1.8, cavity: 0.6, parallax: 0.02 },
  M_cobble: { role: ROLE.other, normal: 2.0, cavity: 0.7, parallax: 0.03 },
  M_roof: { role: ROLE.roof, normal: 2.0, cavity: 0.7, parallax: 0.025 },
  M_roof_terracotta: { role: ROLE.roof, normal: 1.6, cavity: 0.55, parallax: 0.02 },
  M_thatch: { role: ROLE.roof, normal: 1.6, cavity: 0.5, parallax: 0.02 },
  M_timber: { role: ROLE.timber, normal: 1.6, cavity: 0.45, parallax: 0 },
  M_planks: { role: ROLE.timber, normal: 1.6, cavity: 0.55, parallax: 0.01, gain: 1.2 },
  M_clapboard: { role: ROLE.timber, normal: 1.6, cavity: 0.55, parallax: 0.012, gain: 1.8 },
  M_plaster: { role: ROLE.plaster, normal: 1.4, cavity: 0.3, parallax: 0 },
  M_cloth_blue: { role: ROLE.banner, normal: 1, cavity: 0.2, parallax: 0 },
});

export function surfaceOf(materialName) {
  return { ...DEFAULT, ...SURFACES[materialName] };
}

/** Render tones a house may be washed in (multiplies the kit's cream render). */
export const RENDER_PALETTE = Object.freeze([
  [1.0, 0.98, 0.94],
  [1.05, 1.04, 1.01],
  [1.03, 0.94, 0.8],
  [1.04, 0.92, 0.86],
]);
