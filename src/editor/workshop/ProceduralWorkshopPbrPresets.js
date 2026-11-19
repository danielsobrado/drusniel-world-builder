/**
 * Built-in full-PBR workshop material presets backed by on-demand CC0 textures in
 * `public/assets/textures/settlement/` (color + normal + ARM) and
 * `public/assets/textures/locations/` (color + normal + roughness).
 *
 * Pure data only — safe in Node tests and workers; GPU textures load lazily on use.
 */
const DEFINITIONS = Object.freeze([
  // Stone & fortress masonry
  {
    id: 'pbr-dressed-stone', label: 'PBR · Castle Ashlar', category: 'Stone & Masonry', family: 'stone',
    folder: 'locations', set: 'dressed-stone', maps: 'rough', repeat: 1.35, roughness: 0.96, normalStrength: 1.15,
  },
  {
    id: 'pbr-granite', label: 'PBR · Dressed Granite', category: 'Stone & Masonry', family: 'stone',
    folder: 'locations', set: 'granite', maps: 'rough', repeat: 1.3, roughness: 0.94, normalStrength: 1.1,
  },
  {
    id: 'pbr-basalt', label: 'PBR · Dark Fortress Basalt', category: 'Stone & Masonry', family: 'stone',
    folder: 'locations', set: 'basalt', maps: 'rough', repeat: 1.4, roughness: 0.92, normalStrength: 1.25,
  },
  {
    id: 'pbr-stone-rock', label: 'PBR · Cut Quarry Stone', category: 'Stone & Masonry', family: 'stone',
    folder: 'settlement', set: 'stone-rock', maps: 'arm', repeat: 1.15, roughness: 0.98, normalStrength: 1.05, baseColor: '#dad4c8',
  },
  {
    id: 'pbr-stone-rubble', label: 'PBR · Rustic Rubble Stone', category: 'Stone & Masonry', family: 'walls',
    folder: 'settlement', set: 'stone-rubble', maps: 'arm', repeat: 1.25, roughness: 0.98, normalStrength: 1.2, baseColor: '#d2cabd',
  },
  {
    id: 'pbr-flag-monastery', label: 'PBR · Monastery Cut Stone', category: 'Stone & Masonry', family: 'stone',
    folder: 'settlement', set: 'flag-monastery', maps: 'arm', repeat: 1.2, roughness: 0.96, normalStrength: 1.1,
  },
  {
    id: 'pbr-flag-slate', label: 'PBR · Dark Slate Stone', category: 'Stone & Masonry', family: 'stone',
    folder: 'settlement', set: 'flag-slate', maps: 'arm', repeat: 1.3, roughness: 0.92, normalStrength: 1.05,
  },
  {
    id: 'pbr-cave-rock', label: 'PBR · Weathered Crag Stone', category: 'Stone & Masonry', family: 'stone',
    folder: 'locations', set: 'cave-rock', maps: 'rough', repeat: 1.1, roughness: 0.98, normalStrength: 1.3,
  },
  // Brick & cobble
  {
    id: 'pbr-brick-castle', label: 'PBR · Red Castle Brick', category: 'Brick & Cobble', family: 'walls',
    folder: 'settlement', set: 'brick-castle', maps: 'arm', repeat: 1.4, roughness: 0.96, normalStrength: 1.15,
  },
  {
    id: 'pbr-brick-weathered', label: 'PBR · Weathered Brick', category: 'Brick & Cobble', family: 'walls',
    folder: 'settlement', set: 'brick-weathered', maps: 'arm', repeat: 1.4, roughness: 0.96, normalStrength: 1.15,
  },
  {
    id: 'pbr-cobble-grey', label: 'PBR · Grey Cobblestone', category: 'Brick & Cobble', family: 'stone',
    folder: 'settlement', set: 'cobble-grey', maps: 'arm', repeat: 1.5, roughness: 0.96, normalStrength: 1.15,
  },
  {
    id: 'pbr-cobble-dark', label: 'PBR · Dark Cobblestone', category: 'Brick & Cobble', family: 'stone',
    folder: 'settlement', set: 'cobble-dark', maps: 'arm', repeat: 1.5, roughness: 0.94, normalStrength: 1.15,
  },
  {
    id: 'pbr-cobble-mossy', label: 'PBR · Mossy Cobblestone', category: 'Brick & Cobble', family: 'stone',
    folder: 'settlement', set: 'cobble-mossy', maps: 'arm', repeat: 1.45, roughness: 0.96, normalStrength: 1.2,
  },
  // Plaster & stucco
  {
    id: 'pbr-plaster-lime', label: 'PBR · Warm Limewash Plaster', category: 'Plaster', family: 'walls',
    folder: 'settlement', set: 'plaster-lime', maps: 'arm', repeat: 1.6, roughness: 0.98, normalStrength: 0.75, baseColor: '#dfd7c3',
  },
  {
    id: 'pbr-plaster-daub', label: 'PBR · Clay Daub Plaster', category: 'Plaster', family: 'walls',
    folder: 'settlement', set: 'plaster-daub', maps: 'arm', repeat: 1.6, roughness: 0.98, normalStrength: 0.9, baseColor: '#d3b892',
  },
  {
    id: 'pbr-plaster-flaking', label: 'PBR · Flaking Old Plaster', category: 'Plaster', family: 'walls',
    folder: 'settlement', set: 'plaster-flaking', maps: 'arm', repeat: 1.5, roughness: 0.98, normalStrength: 0.95, baseColor: '#d8d0be',
  },
  // Roofs
  {
    id: 'pbr-roof-slate', label: 'PBR · Slate Roof Tiles', category: 'Roofing', family: 'roof',
    folder: 'settlement', set: 'roof-slate', maps: 'arm', repeat: 1.8, roughness: 0.92, normalStrength: 1.15, baseColor: '#5c6b75', mapping: 'local',
  },
  {
    id: 'pbr-roof-clay', label: 'PBR · Terracotta Roof Tiles', category: 'Roofing', family: 'roof',
    folder: 'settlement', set: 'roof-clay', maps: 'arm', repeat: 1.8, roughness: 0.92, normalStrength: 1.15, baseColor: '#b56343', mapping: 'local',
  },
  // Timber & metal
  {
    id: 'pbr-timber-beam', label: 'PBR · Aged Timber Beam', category: 'Timber & Metal', family: 'wood',
    folder: 'settlement', set: 'timber-beam', maps: 'arm', repeat: 1.5, roughness: 0.94, normalStrength: 1.0, baseColor: '#9c714c', mapping: 'local',
  },
  {
    id: 'pbr-oak-planks', label: 'PBR · Weathered Oak Planks', category: 'Timber & Metal', family: 'wood',
    folder: 'locations', set: 'planks', maps: 'rough', repeat: 1.5, roughness: 0.94, normalStrength: 1.05, mapping: 'local',
  },
  {
    id: 'pbr-iron', label: 'PBR · Forged Iron', category: 'Timber & Metal', family: 'metal',
    folder: 'locations', set: 'iron', maps: 'rough', repeat: 1.5, roughness: 0.62, metalness: 0.78, normalStrength: 0.95, mapping: 'local',
  },
]);

export const WORKSHOP_PBR_ASSET_KEYS = Object.freeze(
  new Set(DEFINITIONS.map(({ folder, set }) => `${folder}/${set}`)),
);

export const WORKSHOP_PBR_PRESET_LIST = Object.freeze(
  DEFINITIONS.map((def) => Object.freeze({
    id: def.id,
    label: def.label,
    category: def.category,
    family: def.family,
    pbrAsset: Object.freeze({ folder: def.folder, set: def.set, maps: def.maps }),
    baseColor: def.baseColor ?? '#ffffff',
    tint: '#ffffff',
    roughness: def.roughness ?? 0.96,
    metalness: def.metalness ?? 0,
    normalStrength: def.normalStrength ?? 1,
    aoStrength: 1,
    heightStrength: 0,
    weathering: 0.25,
    mapping: def.mapping ?? 'projected',
    repeat: def.repeat ?? 1.4,
    rotation: 0,
    alignment: def.mapping === 'local' ? 'local' : 'world',
    sources: Object.freeze({}),
  })),
);

export const WORKSHOP_PBR_PRESETS = Object.freeze(
  Object.fromEntries(WORKSHOP_PBR_PRESET_LIST.map((preset) => [preset.id, preset])),
);
