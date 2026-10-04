import { house003 } from './house003.js';
import { house004 } from './house004.js';
import { house005 } from './house005.js';
import { house006 } from './house006.js';
import { house009 } from './house009.js';

export const HOUSE_DESIGNS = Object.freeze({
  '003': { file: 'medieval-house-003', build: house003, seed: 3, origin: [-0.912, -0.066, -3.141], palette: { roofTiles: 0.85, wood: 0.8 } },
  '004': {
    file: 'medieval-house-004-tavern', build: house004, seed: 4, origin: [-0.006, -0.021, 0.003],
    palette: { darkStone: 0.45, wood: 0.55, planks: 0.55, plaster: 0.7, roofTiles: [1.35, 0.7, 0.45] },
  },
  '005': {
    file: 'medieval-house-005-blacksmith', build: house005, seed: 5, origin: [-0.864, -0.042, -1.014],
    palette: { darkStone: 0.4, stone: 0.5, wood: 0.5, plaster: 0.65, roofTiles: [0.6, 0.42, 0.38], deck: 0.75 },
  },
  '006': {
    file: 'medieval-house-006-residential', build: house006, seed: 6, grimeHeight: 1.4, groundY: 1.4, origin: [-2.2, -1.506, 1.481],
    palette: { darkStone: 0.4, stone: 0.5, wood: 0.45, plaster: 0.3, roofTiles: [0.95, 0.65, 0.55] },
  },
  '009': {
    file: 'medieval-house-009-tavern', build: house009, seed: 9, grimeHeight: 2.0, groundY: 1.9, origin: [-0.651, -2.252, -0.003],
    palette: { darkStone: 0.45, wood: 0.55, plaster: [0.15, 0.16, 0.19], roofSlate: 0.5, stone: 0.5 },
  },
});

