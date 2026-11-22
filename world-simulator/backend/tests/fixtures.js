import { loadConfig } from '../src/config/loadConfig.js';
import { buildWorldModel } from '../src/world/WorldModel.js';

export const config = loadConfig({ env: {} });

let eldara;
/** The real Eldara model, built once per test file. */
export function eldaraModel() {
  eldara ??= buildWorldModel(config);
  return eldara;
}

const cell = (i, extra = {}) => ({ i, pop: 1, biome: 6, h: 30, t: 2, f: 1, r: 0, province: 1, ...extra });

/**
 * A tiny Azgaar document: burgs 1-4 on one road chain (2 and 3 meet through a
 * junction cell 9), burg 5 isolated, burg 6 removed, burg 7 invalid.
 */
export function fixtureDocument() {
  return {
    info: { width: 100, height: 100, version: 'test', seed: '1', mapId: 1 },
    settings: { populationRate: 1000, urbanization: 1, distanceScale: 3, distanceUnit: 'mi', options: {} },
    biomesData: { name: ['Marine', 'Hot desert', 'Cold desert', 'Savanna', 'Grassland', 'Tropical seasonal forest', 'Temperate deciduous forest'] },
    pack: {
      cells: Array.from({ length: 12 }, (_, i) => cell(i)),
      states: [{ i: 0, name: 'Neutrals' }, { i: 1, name: 'Alpha', rural: 2 }, { i: 2, name: 'Gone', removed: true }],
      provinces: [0, { i: 1, name: 'North', state: 1 }],
      cultures: [{ i: 0, name: 'Wildlands' }, { i: 1, name: 'Folk' }],
      goods: [{ i: 1, name: 'Iron', tags: ['ore'] }, { i: 2, name: 'Grain', tags: ['food'] }, { i: 3, name: 'Tools', tags: ['construction'] }],
      markets: [{ i: 1, centerBurgId: 3 }],
      burgs: [
        {},
        { i: 1, name: 'One', x: 10, y: 10, cell: 1, state: 1, culture: 1, population: 0.5, capital: 1, production: [{ goodId: 1, units: 1 }] },
        { i: 2, name: 'Two', x: 20, y: 10, cell: 2, state: 1, culture: 1, population: 2.5, production: [{ goodId: 2, units: 1 }] },
        { i: 3, name: 'Three', x: 30, y: 10, cell: 3, state: 1, culture: 1, population: 16, port: 1, production: [{ goodId: 3, units: 1, recipe: [{ goodId: 1, units: 1 }] }] },
        { i: 4, name: 'Four', x: 40, y: 10, cell: 4, state: 1, culture: 1, population: 30 },
        { i: 5, name: 'Lonely', x: 21, y: 12, cell: 5, state: 1, culture: 1, population: 1 },
        { i: 6, name: 'Removed', x: 50, y: 50, cell: 6, removed: true, population: 5 },
        { i: 7, name: '', x: 60, y: 60, cell: 7, population: 5 },
      ],
      routes: [
        { i: 0, group: 'roads', points: [[10, 10, 1], [20, 10, 2], [25, 10, 9]] },
        { i: 1, group: 'trails', points: [[25, 10, 9], [30, 10, 3], [40, 10, 4]] },
        { i: 2, group: 'trails', points: [[70, 70, 10], [80, 80, 11]] },
        { i: 3, group: 'searoutes', points: [[30, 10, 3], [21, 12, 5]] },
      ],
    },
  };
}
