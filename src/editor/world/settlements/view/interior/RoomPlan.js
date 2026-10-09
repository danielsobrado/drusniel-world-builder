/**
 * What stands in a settlement's rooms, and what lights them.
 *
 * A plan is plain data in the room's own frame — x along the frontage, z
 * toward the door, heights above the floor — so the mesh builder draws it, the
 * collision provider blocks it and a test can read it, all from one list.
 * Rooms are dressed by the building's trade in the manner of a northern
 * fantasy hall: a stone hearth with its pot, furs and rugs, banners and a
 * shield or antlers on the wall, candles in sconces, casks and sacks.
 *
 * Deterministic: the same building is furnished the same on every visit.
 */

const FIRE = [1.0, 0.5, 0.18];
const CANDLE = [1.0, 0.72, 0.4];

/** Kinds that are stores rather than homes: stacked goods, no bed. */
const STORE_KINDS = new Set(['warehouse', 'barn']);
const TRADE_KINDS = new Set(['shop', 'bakery']);

function seeded(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A piece that blocks: `solid` is `[x0, x1, z0, z1, height]`. */
const solid = (x0, x1, z0, z1, height) => [Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), height];

function hearth(room, x, { trophy = false } = {}) {
  // What hangs on the chimney breast sits between the lintel and the ceiling, however low that is.
  const hung = Math.min(2.05, (1.6 + room.ceiling) / 2);
  // A candle in a bracket either side of the chimney breast, where the wall is long enough to carry them.
  const sconces = room.width >= 4.6
    ? [-1, 1].map((side) => ({ type: 'sconce', x: x + side * Math.min(1.9, room.width / 2 - 0.5), z: room.back + 0.05, y: 1.65, facing: [0, 1] }))
    : [];
  return [
    ...sconces,
    { type: 'hearth', x, z: room.back, solid: solid(x - 0.85, x + 0.85, room.back, room.back + 0.6, 1.6) },
    { type: 'pot', x, z: room.back + 0.34 },
    { type: 'firewood', x: x + 1.25, z: room.back + 0.3, solid: solid(x + 0.95, x + 1.55, room.back, room.back + 0.5, 0.5) },
    trophy ? { type: 'trophy', x, z: room.back + 0.43, y: hung - 0.1 } : { type: 'shield', x, z: room.back + 0.43, y: hung, facing: [0, 1] },
  ];
}

function tableSet(x, z, width, depth, { benches = false } = {}) {
  const seats = benches
    ? [{ type: 'bench', x, z: z - depth / 2 - 0.35, length: width * 0.9 }, { type: 'bench', x, z: z + depth / 2 + 0.35, length: width * 0.9 }]
    : [{ type: 'stool', x: x - width / 4, z: z + depth / 2 + 0.3 }, { type: 'stool', x: x + width / 4, z: z - depth / 2 - 0.3 }];
  return [
    { type: 'table', x, z, width, depth, solid: solid(x - width / 2, x + width / 2, z - depth / 2, z + depth / 2, 0.8) },
    { type: 'candle', x: x + width * 0.2, z, y: 0.78 },
    { type: 'tableware', x: x - width * 0.18, z: z + depth * 0.12, y: 0.78 },
    ...seats,
  ];
}

function goods(random, x, z, towardX, towardZ) {
  const pieces = [];
  const kinds = ['cask', 'sack', 'crate', 'cask'];
  for (let index = 0; index < 3; index += 1) {
    const type = kinds[Math.floor(random() * kinds.length)];
    const px = x + towardX * index * 0.68;
    const pz = z + towardZ * (index % 2) * 0.62;
    pieces.push({ type, x: px, z: pz, solid: solid(px - 0.32, px + 0.32, pz - 0.32, pz + 0.32, 0.8) });
  }
  return pieces;
}

function dwelling(room, random) {
  const { x0, x1, back, inner, width, depth, middleX, middleZ } = room;
  const pieces = [];
  if (width >= 3) pieces.push(...hearth(room, middleX));
  const bedSide = random() < 0.5 ? 1 : -1;
  if (depth >= 3 && width >= 3.2) {
    const x = bedSide > 0 ? x0 + 0.06 : x1 - 1.06;
    pieces.push({ type: 'bed', x, z: back + 0.2, solid: solid(x, x + 1, back + 0.2, back + 2.2, 0.6) });
    if (depth >= 4.2) pieces.push({ type: 'chest', x: x + 0.5, z: back + 2.75, solid: solid(x + 0.05, x + 0.95, back + 2.45, back + 3.05, 0.5) });
  }
  if (width >= 4.4 && depth >= 3.2) {
    const x = middleX - bedSide * width * 0.27;
    pieces.push(...tableSet(x, Math.min(middleZ + 0.2, inner - 1.9), 1.4, 0.8));
  }
  if (width >= 3.6 && depth >= 3.4) pieces.push({ type: 'rug', x: middleX, z: middleZ + 0.3, width: Math.min(2.4, width - 1.8), depth: Math.min(1.6, depth - 2.2), fur: random() < 0.5 });
  if (depth >= 3.6) {
    const wallX = bedSide > 0 ? x1 : x0;
    pieces.push({ type: 'banner', x: wallX - bedSide * 0.03, z: back + depth * 0.3, y: 1.15, facing: [-bedSide, 0], hue: Math.floor(random() * 3) });
    pieces.push(...goods(random, wallX - bedSide * 0.45, inner - 0.5, -bedSide, -1));
  }
  return pieces;
}

function tavern(room, random) {
  const { x0, x1, back, inner, width, depth, middleX, middleZ } = room;
  const pieces = [];
  if (width >= 3) pieces.push(...hearth(room, middleX, { trophy: true }));
  if (width >= 4 && depth >= 3.4) {
    pieces.push({ type: 'counter', x: x0 + 0.95, z0: back + 1.3, z1: inner - 0.9, solid: solid(x0 + 0.7, x0 + 1.2, back + 1.3, inner - 0.9, 1.1) });
    for (let z = back + 1.6; z < inner - 1.1; z += 0.72) pieces.push({ type: 'cask', x: x0 + 0.34, z, solid: solid(x0 + 0.04, x0 + 0.64, z - 0.3, z + 0.3, 0.8) });
  }
  for (let x = x0 + 2.9; x < x1 - 1; x += 2.5) pieces.push(...tableSet(x, middleZ + 0.2, 1.7, 0.75, { benches: true }));
  // Only where it clears a head.
  if (width >= 4.5 && depth >= 4 && room.ceiling >= 2.85) pieces.push({ type: 'chandelier', x: middleX + 0.6, z: middleZ + 0.2 });
  pieces.push({ type: 'banner', x: x1 - 0.03, z: middleZ, y: 1.15, facing: [-1, 0], hue: Math.floor(random() * 3) });
  // A common room is lit along its wall whether or not a wheel of candles fits under its joists.
  if (depth >= 3.6) {
    for (const side of [-1, 1]) pieces.push({ type: 'sconce', x: x1 - 0.05, z: middleZ + side * Math.min(1.5, depth / 2 - 0.6), y: 1.65, facing: [-1, 0] });
  }
  return pieces;
}

function trade(room, random, kind) {
  const { x0, x1, back, inner, width, depth, middleX, middleZ } = room;
  const pieces = [];
  if (kind === 'bakery' && width >= 3) pieces.push(...hearth(room, middleX));
  if (depth >= 2.8) pieces.push({ type: 'shelves', x: x0, facing: 1, z0: back + 0.35, z1: inner - 0.7, solid: solid(x0, x0 + 0.36, back + 0.35, inner - 0.7, 1.7) });
  if (depth >= 2.8 && width >= 4) pieces.push({ type: 'shelves', x: x1, facing: -1, z0: back + 0.35, z1: inner - 0.7, solid: solid(x1 - 0.36, x1, back + 0.35, inner - 0.7, 1.7) });
  if (width >= 3.6 && depth >= 3.8) {
    pieces.push({ type: 'counter', x: middleX, crosswise: true, x0: middleX - 1.1, x1: middleX + 1.1, z: middleZ - 0.2, solid: solid(middleX - 1.1, middleX + 1.1, middleZ - 0.45, middleZ + 0.05, 1.05) });
    pieces.push({ type: 'candle', x: middleX + 0.7, z: middleZ - 0.2, y: 1.06 }, { type: 'tableware', x: middleX - 0.4, z: middleZ - 0.2, y: 1.06 });
  }
  if (kind !== 'bakery') pieces.push(...goods(random, middleX - 0.7, back + 0.45, 1, 1));
  return pieces;
}

function store(room, random, kind) {
  const { x0, x1, back, inner, width, depth, middleX } = room;
  const pieces = [];
  if (kind === 'smithy' && width >= 3) {
    pieces.push(...hearth(room, middleX).filter(({ type }) => type !== 'pot' && type !== 'shield' && type !== 'sconce'));
    pieces.push({ type: 'anvil', x: middleX, z: back + 1.5, solid: solid(middleX - 0.3, middleX + 0.3, back + 1.3, back + 1.7, 0.7) });
  }
  for (let z = back + 0.45; z < inner - 1.2; z += 1.5) {
    pieces.push(...goods(random, x0 + 0.45, z, 1, 0), ...(width >= 4.5 ? goods(random, x1 - 0.45, z, -1, 0) : []));
  }
  if (depth >= 3) pieces.push({ type: 'shelves', x: x1, facing: -1, z0: inner - 2.4, z1: inner - 0.7, solid: solid(x1 - 0.36, x1, inner - 2.4, inner - 0.7, 1.7) });
  return pieces;
}

function chapel(room) {
  const { back, inner, width, middleX } = room;
  const pieces = [
    { type: 'altar', x: middleX, z: back + 0.6, solid: solid(middleX - 0.7, middleX + 0.7, back + 0.3, back + 0.9, 1.05) },
    { type: 'candle', x: middleX - 0.45, z: back + 0.6, y: 1.06 },
    { type: 'candle', x: middleX + 0.45, z: back + 0.6, y: 1.06 },
    { type: 'banner', x: middleX - 1.3, z: back + 0.03, y: 1.2, facing: [0, 1], hue: 1 },
    { type: 'banner', x: middleX + 1.3, z: back + 0.03, y: 1.2, facing: [0, 1], hue: 1 },
    { type: 'rug', x: middleX, z: (back + inner) / 2 + 0.3, width: 0.9, depth: Math.max(1, inner - back - 2.6), fur: false },
  ];
  const half = (width - 1.5) / 2;
  if (half >= 0.8) {
    for (let z = back + 2.1; z < inner - 1.3; z += 1.15) {
      for (const side of [-1, 1]) {
        const x = middleX + side * (0.6 + half / 2);
        pieces.push({ type: 'bench', x, z, length: half * 0.9, back: true, solid: solid(x - half * 0.45, x + half * 0.45, z - 0.2, z + 0.2, 0.5) });
      }
    }
  }
  return pieces;
}

/** Fire, candles and daylight a room is lit by, from what stands in it and where its openings are. */
function lightsOf(room, pieces, ceiling) {
  const lights = [{ sky: true, at: [(room.doorLeft + room.doorRight) / 2, 1.2, room.inner - 0.3], strength: 0.55, radius: 1.3 }];
  if (room.depth >= 3) {
    lights.push({ sky: true, at: [room.x0 + 0.3, 1.5, room.middleZ], strength: 0.45, radius: 1.1 });
    lights.push({ sky: true, at: [room.x1 - 0.3, 1.5, room.middleZ], strength: 0.45, radius: 1.1 });
  }
  for (const piece of pieces) {
    if (piece.type === 'hearth') lights.push({ at: [piece.x, 0.7, piece.z + 0.9], color: FIRE, strength: 2.6, radius: 1.5 });
    if (piece.type === 'sconce') lights.push({ at: [piece.x + piece.facing[0] * 0.3, piece.y + 0.25, piece.z + piece.facing[1] * 0.3], color: CANDLE, strength: 0.6, radius: 0.9 });
    if (piece.type === 'candle') lights.push({ at: [piece.x, piece.y + 0.3, piece.z], color: CANDLE, strength: 0.6, radius: 0.8 });
    if (piece.type === 'chandelier') lights.push({ at: [piece.x, ceiling - 0.9, piece.z], color: CANDLE, strength: 1.3, radius: 1.5 });
  }
  return lights;
}

/**
 * @param {object} building a planned building with its `kind`
 * @param {{ x0: number, x1: number, back: number, inner: number, doorLeft: number, doorRight: number }} shell
 *   its room (SettlementInteriorGeometry.houseShell)
 * @param {number} ceiling the room's height, in metres
 * @returns {{ pieces: object[], lights: object[], windows: boolean }} heights are above the floor
 */
export function planRoom(building, shell, ceiling = 2.7) {
  const room = {
    ...shell,
    ceiling,
    width: shell.x1 - shell.x0,
    depth: shell.inner - shell.back,
    middleX: (shell.x0 + shell.x1) / 2,
    middleZ: (shell.back + shell.inner) / 2,
  };
  const random = seeded(Math.round(building.x * 131 + building.z * 71) ^ 0x51ed27);
  const { kind } = building;
  const all = kind === 'chapel' ? chapel(room)
    : kind === 'tavern' ? tavern(room, random)
      : TRADE_KINDS.has(kind) ? trade(room, random, kind)
        : STORE_KINDS.has(kind) || kind === 'smithy' ? store(room, random, kind)
          : dwelling(room, random);
  // The way in stays clear: nothing solid in the strip just inside the door, and nothing outside the room.
  const clear = [room.doorLeft - 0.35, room.doorRight + 0.35, room.inner - 1.5, room.inner];
  const pieces = all.filter(({ solid: box }) => {
    if (!box) return true;
    if (box[0] < room.x0 - 0.01 || box[1] > room.x1 + 0.01 || box[2] < room.back - 0.01 || box[3] > room.inner + 0.01) return false;
    return box[1] <= clear[0] || box[0] >= clear[1] || box[3] <= clear[2];
  });
  return { pieces, lights: lightsOf(room, pieces, ceiling), windows: room.depth >= 3 };
}
