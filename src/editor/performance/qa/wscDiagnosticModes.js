/**
 * Pure registry and categorical palette for World Surface Context (WSC) PR 0
 * visual diagnostic modes (D00–D25).
 *
 * Production defaults to `D00` (disabled). No shader nodes are built unless a QA
 * harness explicitly activates a diagnostic mode.
 */

export const WSC_DEFAULT_DIAGNOSTIC_MODE = 'D00';

/**
 * Deterministic sRGB palette for D24 (Material family classification).
 * Chosen with large pairwise RGB separation so offline image analysis can
 * segment pixels reliably without anti-aliasing ambiguity.
 */
export const WSC_MATERIAL_FAMILIES = Object.freeze({
  terrain: Object.freeze({ id: 'terrain', label: 'Terrain', rgb: [46, 125, 50] }),
  nearGrass: Object.freeze({ id: 'nearGrass', label: 'Near grass blades', rgb: [118, 255, 3] }),
  farGrassCards: Object.freeze({ id: 'farGrassCards', label: 'Far grass cards', rgb: [238, 255, 65] }),
  treeFoliage: Object.freeze({ id: 'treeFoliage', label: 'Tree foliage', rgb: [0, 176, 255] }),
  treeBark: Object.freeze({ id: 'treeBark', label: 'Tree bark', rgb: [141, 110, 99] }),
  treeImpostor: Object.freeze({ id: 'treeImpostor', label: 'Tree impostor', rgb: [0, 229, 255] }),
  shrub: Object.freeze({ id: 'shrub', label: 'Shrub', rgb: [255, 196, 0] }),
  shrubProxy: Object.freeze({ id: 'shrubProxy', label: 'Shrub LOD proxy', rgb: [255, 145, 0] }),
  understory: Object.freeze({ id: 'understory', label: 'Ferns & small understories', rgb: [174, 234, 0] }),
  flowers: Object.freeze({ id: 'flowers', label: 'Flowers', rgb: [255, 64, 129] }),
  rock: Object.freeze({ id: 'rock', label: 'Rocks & boulders', rgb: [124, 77, 255] }),
  debris: Object.freeze({ id: 'debris', label: 'Fallen logs & stumps', rgb: [216, 67, 21] }),
  cliff: Object.freeze({ id: 'cliff', label: 'Alpine crags & cliffs', rgb: [63, 81, 181] }),
  building: Object.freeze({ id: 'building', label: 'Buildings & foundations', rgb: [244, 67, 54] }),
  paving: Object.freeze({ id: 'paving', label: 'Settlement paving', rgb: [255, 213, 79] }),
  water: Object.freeze({ id: 'water', label: 'Water', rgb: [21, 101, 192] }),
  other: Object.freeze({ id: 'other', label: 'Other / unclassified', rgb: [158, 158, 158] }),
});

/** Deterministic sRGB palette for D20 (LOD representation classification). */
export const WSC_LOD_CLASSES = Object.freeze({
  terrain: Object.freeze({ id: 'terrain', label: 'Terrain chunk', rgb: [72, 84, 96] }),
  nearGrass: Object.freeze({ id: 'nearGrass', label: 'Near grass blades', rgb: [56, 224, 72] }),
  farGrassCards: Object.freeze({ id: 'farGrassCards', label: 'Far grass cards', rgb: [212, 238, 64] }),
  treeNear: Object.freeze({ id: 'treeNear', label: 'Tree near mesh', rgb: [24, 180, 120] }),
  treeProxy: Object.freeze({ id: 'treeProxy', label: 'Tree proxy', rgb: [255, 138, 28] }),
  treeImpostor: Object.freeze({ id: 'treeImpostor', label: 'Tree impostor', rgb: [24, 210, 245] }),
  bushNear: Object.freeze({ id: 'bushNear', label: 'Bush near mesh', rgb: [0, 178, 169] }),
  bushProxy: Object.freeze({ id: 'bushProxy', label: 'Bush LOD proxy', rgb: [255, 206, 48] }),
  rockNear: Object.freeze({ id: 'rockNear', label: 'Rock near mesh', rgb: [76, 124, 255] }),
  rockProxy: Object.freeze({ id: 'rockProxy', label: 'Rock LOD proxy', rgb: [186, 85, 255] }),
  buildingNear: Object.freeze({ id: 'buildingNear', label: 'Building / prop near', rgb: [244, 92, 82] }),
  buildingFar: Object.freeze({ id: 'buildingFar', label: 'Building far / skyline', rgb: [244, 148, 210] }),
  other: Object.freeze({ id: 'other', label: 'Other', rgb: [148, 154, 160] }),
});

export const WSC_DIAGNOSTIC_MODES = Object.freeze({
  D00: Object.freeze({ id: 'D00', slug: 'normal', label: 'Normal rendering', supported: true, stage: 'final' }),
  D01: Object.freeze({ id: 'D01', slug: 'albedo', label: 'Resolved unlit albedo', supported: true, stage: 'resolved-albedo' }),
  D02: Object.freeze({ id: 'D02', slug: 'source-albedo', label: 'Source albedo', supported: true, stage: 'raw-input' }),
  D03: Object.freeze({ id: 'D03', slug: 'biome-pigment', label: 'Biome pigment', supported: true, stage: 'raw-input' }),
  D04: Object.freeze({ id: 'D04', slug: 'local-tint', label: 'Local environmental tint', supported: true, stage: 'raw-input' }),
  D05: Object.freeze({ id: 'D05', slug: 'normals', label: 'Surface normals', supported: true, stage: 'resolved-surface' }),
  D06: Object.freeze({ id: 'D06', slug: 'roughness', label: 'Roughness', supported: true, stage: 'resolved-surface' }),
  D07: Object.freeze({ id: 'D07', slug: 'metalness', label: 'Metalness', supported: true, stage: 'resolved-surface' }),
  D08: Object.freeze({ id: 'D08', slug: 'contact-ao', label: 'Contact occlusion', supported: true, stage: 'raw-input' }),
  D09: Object.freeze({ id: 'D09', slug: 'canopy', label: 'Canopy coverage', supported: true, stage: 'raw-input' }),
  D10: Object.freeze({ id: 'D10', slug: 'forest-litter', label: 'Forest litter', supported: true, stage: 'raw-input' }),
  D11: Object.freeze({ id: 'D11', slug: 'vegetation-coverage', label: 'Vegetation coverage', supported: true, stage: 'raw-input' }),
  D12: Object.freeze({ id: 'D12', slug: 'substrate', label: 'Soil / substrate pigment', supported: true, stage: 'raw-input' }),
  D13: Object.freeze({ id: 'D13', slug: 'gc-height', label: 'Ground-contact height delta', supported: true, stage: 'raw-input' }),
  D14: Object.freeze({ id: 'D14', slug: 'gc-normal', label: 'Ground-contact normal', supported: true, stage: 'raw-input' }),
  D15: Object.freeze({ id: 'D15', slug: 'gc-validity', label: 'Ground-contact validity', supported: true, stage: 'raw-input' }),
  D16: Object.freeze({ id: 'D16', slug: 'direct-lighting', label: 'Direct lighting', supported: true, stage: 'isolated-lighting' }),
  D17: Object.freeze({ id: 'D17', slug: 'indirect-lighting', label: 'Indirect lighting', supported: true, stage: 'isolated-lighting' }),
  D18: Object.freeze({ id: 'D18', slug: 'emissive', label: 'Emissive contribution', supported: true, stage: 'resolved-surface' }),
  D19: Object.freeze({ id: 'D19', slug: 'shadow', label: 'Shadow contribution', supported: true, stage: 'isolated-lighting' }),
  D20: Object.freeze({ id: 'D20', slug: 'lod', label: 'LOD classification', supported: true, stage: 'classification' }),
  D21: Object.freeze({ id: 'D21', slug: 'wetness', label: 'Wetness', supported: true, stage: 'raw-input' }),
  D22: Object.freeze({ id: 'D22', slug: 'moss', label: 'Moss eligibility (approximate)', supported: 'partial', stage: 'raw-input' }),
  D23: Object.freeze({ id: 'D23', slug: 'snow', label: 'Snow coverage', supported: true, stage: 'raw-input' }),
  D24: Object.freeze({ id: 'D24', slug: 'material-family', label: 'Material family', supported: true, stage: 'classification' }),
  D25: Object.freeze({ id: 'D25', slug: 'chunk-boundaries', label: 'Chunk & field boundaries', supported: true, stage: 'overlay' }),
});

const BY_SLUG = new Map(Object.values(WSC_DIAGNOSTIC_MODES).map((entry) => [entry.slug, entry.id]));

/** Resolves a mode ID (`D01`) or slug (`albedo`) into its canonical mode record. */
export function resolveWscDiagnosticMode(input = WSC_DEFAULT_DIAGNOSTIC_MODE) {
  if (input === null || input === undefined || input === '' || input === false) {
    return WSC_DIAGNOSTIC_MODES.D00;
  }
  const key = String(input).trim();
  const upper = key.toUpperCase();
  if (upper in WSC_DIAGNOSTIC_MODES) return WSC_DIAGNOSTIC_MODES[upper];
  const bySlug = BY_SLUG.get(key.toLowerCase());
  if (bySlug) return WSC_DIAGNOSTIC_MODES[bySlug];
  throw new Error(`Unknown WSC diagnostic mode: ${input}`);
}

/**
 * Classifies a scene mesh + material into one of the 17 audited material
 * families and its active LOD representation.
 */
export function classifySceneMesh(mesh, material) {
  const matName = String(material?.name ?? '').toLowerCase();
  const meshName = String(mesh?.name ?? '').toLowerCase();
  const chain = [];
  let cursor = mesh;
  while (cursor) {
    if (cursor.name) chain.push(String(cursor.name).toLowerCase());
    cursor = cursor.parent;
  }
  const path = `${chain.join('/')} ${meshName} ${matName}`;

  if (mesh?.userData?.terrainSlot || path.includes('terrain-chunk') || path.includes('macro-far-terrain')) {
    return { family: 'terrain', lod: 'terrain' };
  }
  if (matName.includes('meadow-grass-cards') || path.includes('meadow-cards') || path.includes('far-grass')) {
    return { family: 'farGrassCards', lod: 'farGrassCards' };
  }
  if (matName.includes('meadow-grass-blades') || path.includes('meadow-grass') || path.includes('grass')) {
    return { family: 'nearGrass', lod: 'nearGrass' };
  }
  if (path.includes('impostor') && path.includes('tree')) {
    return { family: 'treeImpostor', lod: 'treeImpostor' };
  }
  if (path.includes('stylized-trees') || path.includes('tree')) {
    if (path.includes('proxy') || path.includes('cluster')) {
      return { family: material?.userData?.barkLighting ? 'treeBark' : 'treeFoliage', lod: 'treeProxy' };
    }
    if (material?.userData?.barkLighting || matName.includes('bark') || matName.includes('trunk')) {
      return { family: 'treeBark', lod: 'treeNear' };
    }
    return { family: 'treeFoliage', lod: 'treeNear' };
  }
  if (path.includes('bush') || path.includes('shrub')) {
    const isProxy = mesh?.geometry?.userData?.proxyKind === 'clustered-low-poly-canopy' || path.includes('proxy');
    return { family: isProxy ? 'shrubProxy' : 'shrub', lod: isProxy ? 'bushProxy' : 'bushNear' };
  }
  if (path.includes('flower')) {
    return { family: 'flowers', lod: 'bushNear' };
  }
  if (path.includes('debris') || path.includes('deadwood') || path.includes('log') || path.includes('stump')) {
    return { family: 'debris', lod: 'rockNear' };
  }
  if (path.includes('ground-detail') || path.includes('flora') || path.includes('tropical') || path.includes('understory')) {
    return { family: 'understory', lod: 'bushNear' };
  }
  if (matName.includes('alpine-rock') || path.includes('alpine-rock') || path.includes('crag')) {
    return { family: 'cliff', lod: 'rockNear' };
  }
  if (path.includes('rock') || path.includes('boulder') || path.includes('stone')) {
    const isProxy = path.includes('proxy');
    return { family: 'rock', lod: isProxy ? 'rockProxy' : 'rockNear' };
  }
  if (path.includes('settlement-paving') || matName.includes('settlement-paving') || matName.includes('settlement-ground-shade')) {
    return { family: 'paving', lod: 'buildingNear' };
  }
  if (path.includes('settlement') || path.includes('skyline') || material?.userData?.workshopSlot) {
    const isFar = path.includes('skyline') || path.includes('far');
    return { family: 'building', lod: isFar ? 'buildingFar' : 'buildingNear' };
  }
  if (path.includes('water') || path.includes('ocean') || path.includes('sea')) {
    return { family: 'water', lod: 'other' };
  }
  return { family: 'other', lod: 'other' };
}
