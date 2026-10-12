import { RAMP, TILE } from '../atlas/ParticleAtlasLayout.js';

/**
 * ParticleType records: the static look and behaviour of one kind of
 * particle. Recipes reference types by id; the simulator reads the frozen,
 * defaults-filled record by index.
 */

export const ORIENT = Object.freeze({
  CAMERA: 0,
  AXIS: 1,
  PLANE: 2,
  VELOCITY: 3,
});

export const COLLIDE = Object.freeze({
  NONE: 0,
  BOUNCE: 1,
  STICK: 2,
  DIE: 3,
});

const ORIENT_BY_NAME = Object.freeze({
  camera: ORIENT.CAMERA,
  axis: ORIENT.AXIS,
  plane: ORIENT.PLANE,
  ground: ORIENT.PLANE,
  velocity: ORIENT.VELOCITY,
});

const COLLIDE_BY_NAME = Object.freeze({
  none: COLLIDE.NONE,
  bounce: COLLIDE.BOUNCE,
  stick: COLLIDE.STICK,
  die: COLLIDE.DIE,
});

const TILE_MODES = Object.freeze(['fixed', 'random', 'life']);

const DEFAULTS = Object.freeze({
  tiles: [20, 20],
  tileMode: 'random',
  ramp: RAMP.BLACKBODY,
  lit: 0,
  life: [1, 1],
  size: [1, 1],
  sizeEnd: 1,
  sizeEase: 'outCubic',
  orient: 'camera',
  stretch: 0,
  /** Length ÷ width for axis and velocity sprites whose length follows size. */
  aspect: 1,
  /** How much a fixed axis length grows over life (beams, bolts). */
  axisGrow: 1,
  heat: 1,
  heatEnd: 0,
  heatEase: 'outQuad',
  emissive: 1,
  additive: 1,
  additiveEnd: null,
  opacity: 1,
  /** Opacity multiplier reached at the end of life: smoke thins as it spreads. */
  opacityEnd: 1,
  fadeIn: 0.05,
  fadeOut: 0.6,
  tint: [1, 1, 1],
  tintEnd: null,
  drag: 0,
  gravity: 0,
  turbulence: 0,
  turbulenceScale: 0.35,
  spin: [0, 0],
  spinDrag: 0,
  collide: 'none',
  restitution: 0.35,
  friction: 0.6,
  groundFade: false,
  cameraFade: true,
  swirl: 0,
  attract: 0,
  /** 0..1: how readily the particle's horizontal motion relaxes to the wind's. */
  windDrift: 0,
  trail: null,
  onDeath: null,
  onImpact: null,
  /** Boil and erode in the shader. Null picks it from the tiles (puffs and flames). */
  billow: null,
});

function isPuffTile(tile) {
  return (tile >= TILE.SMOKE_FIRST && tile <= TILE.SMOKE_LAST)
    || (tile >= TILE.FIRE_FIRST && tile <= TILE.FIRE_LAST)
    || (tile >= TILE.FLAME_FIRST && tile <= TILE.FLAME_LAST)
    || tile === TILE.CLOUD
    || tile === TILE.FOG_BANK;
}

function asPair(value) {
  if (Array.isArray(value)) return [Number(value[0]), Number(value[1] ?? value[0])];
  const number = Number(value);
  return [number, number];
}

function assertFinite(id, key, values) {
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error(`Particle type "${id}": ${key} must be finite.`);
  }
}

/** Fills defaults and validates one record. Pure; returns a frozen object. */
export function defineParticleType(id, source) {
  const record = { ...DEFAULTS, ...source, id };
  if (!TILE_MODES.includes(record.tileMode)) {
    throw new Error(`Particle type "${id}": unknown tileMode "${record.tileMode}".`);
  }
  const orient = ORIENT_BY_NAME[record.orient];
  if (orient === undefined) throw new Error(`Particle type "${id}": unknown orient "${record.orient}".`);
  const collide = COLLIDE_BY_NAME[record.collide];
  if (collide === undefined) throw new Error(`Particle type "${id}": unknown collide "${record.collide}".`);
  const life = asPair(record.life);
  const size = asPair(record.size);
  const sizeEnd = asPair(record.sizeEnd);
  const spin = asPair(record.spin);
  const heat = asPair(record.heat);
  assertFinite(id, 'life', life);
  assertFinite(id, 'size', size);
  if (life[0] <= 0) throw new Error(`Particle type "${id}": life must be positive.`);
  const tiles = asPair(record.tiles);
  const billow = record.billow ?? isPuffTile(tiles[0]);
  const tint = record.tint.map(Number);
  const tintEnd = record.tintEnd ? record.tintEnd.map(Number) : tint;
  return Object.freeze({
    ...record,
    life,
    size,
    sizeEnd,
    spin,
    heat,
    tint,
    tintEnd,
    tiles,
    billow: Boolean(billow),
    orientCode: orient,
    collideCode: collide,
    additiveEnd: record.additiveEnd ?? record.additive,
  });
}

/**
 * Registry of types by id with dense indices for the simulator's typed
 * arrays. Sub-emitter references (`trail`, `onDeath`, `onImpact`) resolve
 * lazily by id so types may reference each other in any order.
 */
export function createParticleTypeRegistry(definitions = {}) {
  const records = [];
  const indexById = new Map();

  const register = (id, source) => {
    if (indexById.has(id)) throw new Error(`Particle type "${id}" is already registered.`);
    indexById.set(id, records.length);
    records.push(defineParticleType(id, source));
    return records.length - 1;
  };

  for (const [id, source] of Object.entries(definitions)) register(id, source);

  const indexOf = (id) => {
    const index = indexById.get(id);
    if (index === undefined) throw new Error(`Unknown particle type "${id}".`);
    return index;
  };

  return {
    register,
    registerAll(table) {
      for (const [id, source] of Object.entries(table)) register(id, source);
    },
    indexOf,
    has: (id) => indexById.has(id),
    get: (index) => records[index],
    byId: (id) => records[indexOf(id)],
    get size() {
      return records.length;
    },
    /** Throws if any sub-emitter names a missing type; call after registering. */
    validateReferences() {
      for (const record of records) {
        for (const key of ['trail', 'onDeath', 'onImpact']) {
          const references = [record[key]].flat().filter(Boolean);
          for (const reference of references) {
            if (!indexById.has(reference.type)) {
              throw new Error(`Particle type "${record.id}": ${key} references unknown "${reference.type}".`);
            }
          }
        }
      }
    },
  };
}
