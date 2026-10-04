import { mulberry32, makeFbm, render, makeCourses, smooth, mix, wrap } from './houseTextureMath.js';

// Procedural, seamlessly tiling surfaces for the village houses: albedo plus a
// normal map derived from the same height field, generated in memory at load
// (nothing is downloaded). Pure typed-array code with no three.js import, so
// it can run in a worker as well as on the main thread.
// Every generator works on a square that wraps, so textures tile without
// seams. Rows run with v: row 0 is v = 0, the bottom of a wall or the eave of
// a roof. The per-texel callbacks allocate nothing: they run 65k-262k times.

// World size in metres one texture repeat covers; the house kit divides its
// metre UVs by these.
export const TEXTURE_METRES = Object.freeze({
  stone: 2, darkStone: 2, plaster: 3, wood: 1.5, planks: 2, roofTiles: 2, roofSlate: 2, window: 0.6, deck: 2,
});

function stoneSurface(size, seed, [br, bg, bb], [mr, mg, mb]) {
  const random = mulberry32(seed);
  const cell = makeCourses(random, 9, 0.13, 0.3);
  const grain = makeFbm(random, 8, 5);
  const blotch = makeFbm(random, 3, 3);
  return render(size, 6, (u, v, out) => {
    const c = cell(u, v);
    const n = grain(u, v), b = blotch(u, v);
    const bevel = smooth(0.004, 0.022, c.edge + (n - 0.5) * 0.012);
    // Chipped, rounded block faces: height rises from the joint and wobbles.
    const shade = (0.86 + c.tint * 0.22) * (0.8 + n * 0.35) * (0.85 + b * 0.3);
    const warm = (c.tint - 0.5) * 0.08;
    const joint = 0.8 + n * 0.4, cover = mix(0.35, 1, bevel), course = mix(0.88, 1, smooth(0, 0.5, c.dv));
    out[0] = mix(mr * joint, br * shade * (1 + warm), cover) * course;
    out[1] = mix(mg * joint, bg * shade, cover) * course;
    out[2] = mix(mb * joint, bb * shade * (1 - warm), cover) * course;
    out[3] = bevel * (0.75 + n * 0.35) + (b - 0.5) * 0.15;
  });
}

function plasterSurface(size, seed) {
  const random = mulberry32(seed);
  const large = makeFbm(random, 3, 4);
  const fine = makeFbm(random, 32, 3);
  const stain = makeFbm(random, 5, 4);
  return render(size, 1.5, (u, v, out) => {
    const l = large(u, v), f = fine(u, v), s = stain(u, v);
    // Streaks run down the wall: the stain noise stretched vertically.
    const streak = smooth(0.55, 0.8, stain(u, v * 0.25 + l * 0.2));
    const dirt = smooth(0.5, 0.85, s) * 0.2 + streak * 0.15;
    // Patches where the render fell off show a rougher, darker scratch coat.
    const patch = smooth(0.72, 0.75, l * 0.7 + s * 0.3) * 0.6;
    const shade = (0.9 + (l - 0.5) * 0.18 + (f - 0.5) * 0.12) * mix(1, 0.72, patch);
    out[0] = mix(0.84, 0.52, dirt) * shade;
    out[1] = mix(0.74, 0.44, dirt) * shade;
    out[2] = mix(0.57, 0.34, dirt) * shade;
    out[3] = f * 0.35 + l * 0.2 - patch * 0.25;
  });
}

// Timber: grain runs along u (the length of a beam).
function woodSurface(size, seed, [r, g, b]) {
  const random = mulberry32(seed);
  const warp = makeFbm(random, 4, 4);
  const fine = makeFbm(random, 64, 2);
  const boards = makeFbm(random, 2, 2);
  return render(size, 1.5, (u, v, out) => {
    const w = warp(u, v);
    const rings = Math.sin((v * 22 + w * 5) * Math.PI * 2) * 0.5 + 0.5;
    const streak = fine(u * 0.125, v);
    const shade = 0.72 + rings * 0.18 + (streak - 0.5) * 0.35 + (boards(u, v) - 0.5) * 0.3;
    out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
    out[3] = rings * 0.3 + streak * 0.5;
  });
}

// Vertical boards (doors, sheds, decks): grain runs along v.
function planksSurface(size, seed, [r, g, b], boardCount) {
  const random = mulberry32(seed);
  const warp = makeFbm(random, 4, 4);
  const fine = makeFbm(random, 64, 2);
  const tints = Array.from({ length: boardCount }, () => random());
  const offsets = Array.from({ length: boardCount }, () => random());
  return render(size, 3, (u, v, out) => {
    const board = Math.floor(u * boardCount);
    const across = u * boardCount - board;
    const gap = smooth(0, 0.06, across) * smooth(0, 0.06, 1 - across);
    const w = warp(u, wrap(v + offsets[board]));
    const rings = Math.sin((across * 3 + w * 4) * Math.PI * 2) * 0.5 + 0.5;
    const streak = fine(u, wrap(v * 0.125 + offsets[board]));
    const shade = (0.7 + tints[board] * 0.35) * (0.8 + rings * 0.12 + (streak - 0.5) * 0.4) * mix(0.25, 1, gap);
    out[0] = r * shade; out[1] = g * shade; out[2] = b * shade;
    out[3] = gap * (0.7 + streak * 0.3);
  });
}

// Clay roof tiles in staggered courses. v runs up the slope, so each course's
// lower edge overlaps (and shades) the course below it.
function roofTilesSurface(size, seed) {
  const random = mulberry32(seed);
  const rows = 10, columns = 10;
  const moss = makeFbm(random, 6, 5);
  const grime = makeFbm(random, 3, 4);
  const streaks = makeFbm(random, 8, 3);
  const fine = makeFbm(random, 32, 3);
  const tints = Float32Array.from({ length: rows * columns }, () => random());
  return render(size, 5, (u, v, out) => {
    const row = Math.floor(v * rows);
    const dv = v * rows - row;
    const shifted = wrap(u + (row % 2) * 0.5 / columns + (tints[row] - 0.5) * 0.02);
    const column = Math.floor(shifted * columns);
    const du = shifted * columns - column;
    const tint = tints[(row * columns + column) % tints.length];
    // Barrel profile across the tile, thickening toward its lower lip.
    const barrel = Math.sin(du * Math.PI);
    const lip = smooth(0, 0.12, dv);
    const shadowBelow = mix(0.45, 1, smooth(0, 0.35, dv));
    const n = fine(u, v), m = moss(u, v), g = grime(u, v);
    // Rain streaks run down the slope: noise stretched along v.
    const streak = streaks(u, v * 0.125);
    const shade = (0.82 + barrel * 0.18) * mix(1, shadowBelow, 0.6) * (0.88 + n * 0.24);
    const dirt = Math.min(0.8, smooth(0.3, 0.75, g) * 0.5 + smooth(0.45, 0.75, streak) * 0.45);
    const mossAmount = smooth(0.66, 0.76, m + (1 - barrel) * 0.06 + n * 0.1) * 0.85;
    const mossShade = 0.7 + barrel * 0.3;
    out[0] = mix(mix(0.36 + tint * 0.08, 0.1, dirt) * shade, (0.22 + n * 0.08) * mossShade, mossAmount);
    out[1] = mix(mix(0.15 + tint * 0.04, 0.08, dirt) * shade, (0.26 + n * 0.08) * mossShade, mossAmount);
    out[2] = mix(mix(0.13 + tint * 0.03, 0.07, dirt) * shade, 0.08 * mossShade, mossAmount);
    out[3] = barrel * 0.5 + (1 - dv) * 0.5 * lip + mossAmount * 0.2 + n * 0.1;
  });
}

// Split slate / wooden shingles: flat rectangles with ragged lower edges.
function roofSlateSurface(size, seed) {
  const random = mulberry32(seed);
  const rows = 12, columns = 8;
  const ragged = makeFbm(random, 64, 2);
  const fine = makeFbm(random, 32, 3);
  const grime = makeFbm(random, 3, 4);
  const tints = Float32Array.from({ length: rows * columns * 2 }, () => random());
  return render(size, 5, (u, v, out) => {
    const row = Math.floor(v * rows);
    const dv = v * rows - row;
    const shifted = wrap(u + (row % 2) * 0.5 / columns + tints[row] * 0.3 / columns);
    const column = Math.floor(shifted * columns);
    const du = shifted * columns - column;
    const tint = tints[(row * columns + column) % tints.length];
    const n = fine(u, v), g = grime(u, v);
    const edge = smooth(0, 0.05 + ragged(u, v) * 0.1, dv) * smooth(0, 0.04, du) * smooth(0, 0.04, 1 - du);
    const shadowBelow = mix(0.5, 1, smooth(0, 0.3, dv));
    const shade = shadowBelow * (0.8 + n * 0.35) * mix(0.35, 1, edge) * (0.8 + g * 0.4);
    const lichen = smooth(0.7, 0.78, g + n * 0.15) * 0.3;
    out[0] = mix(0.2 + tint * 0.07, 0.34, lichen) * shade;
    out[1] = mix(0.19 + tint * 0.05, 0.36, lichen) * shade;
    out[2] = mix(0.19 + tint * 0.04, 0.26, lichen) * shade;
    out[3] = edge * (0.6 + (1 - dv) * 0.4) + n * 0.1;
  });
}

// Leaded lights: dark glass behind a diamond lattice of lead cames.
function windowSurface(size, seed) {
  const random = mulberry32(seed);
  const fine = makeFbm(random, 16, 3);
  return render(size, 1, (u, v, out) => {
    const a = wrap((u + v) * 2), b = wrap((u - v) * 2);
    const lead = Math.min(Math.min(a, 1 - a), Math.min(b, 1 - b));
    const came = smooth(0.02, 0.05, lead);
    const n = fine(u, v);
    // Old glass: a greenish sheen that varies pane to pane.
    const sheen = 0.5 + 0.5 * Math.sin((u * 3 + v * 5 + n) * 2);
    const glass = 0.8 + n * 0.4;
    out[0] = mix(0.08, (0.1 + sheen * 0.08) * glass, came);
    out[1] = mix(0.08, (0.13 + sheen * 0.1) * glass, came);
    out[2] = mix(0.08, (0.14 + sheen * 0.1) * glass, came);
    out[3] = came * 0.3 + n * 0.1;
  });
}

const GENERATORS = Object.freeze({
  stone: () => stoneSurface(512, 11, [0.6, 0.6, 0.6], [0.4, 0.38, 0.36]),
  darkStone: () => stoneSurface(512, 23, [0.27, 0.28, 0.31], [0.15, 0.15, 0.15]),
  plaster: () => plasterSurface(256, 5),
  wood: () => woodSurface(256, 7, [0.36, 0.23, 0.14]),
  planks: () => planksSurface(256, 13, [0.42, 0.29, 0.18], 8),
  deck: () => planksSurface(256, 17, [0.36, 0.26, 0.18], 7),
  roofTiles: () => roofTilesSurface(512, 3),
  roofSlate: () => roofSlateSurface(512, 29),
  window: () => windowSurface(128, 31),
});

export const SURFACE_NAMES = Object.freeze(Object.keys(GENERATORS));

/** RGBA albedo and normal texels of a named surface: { size, color, normal }. */
export function generateSurfaceData(name) {
  if (!Object.hasOwn(GENERATORS, name)) throw new Error(`Unknown Gods End surface: ${name}.`);
  return GENERATORS[name]();
}
