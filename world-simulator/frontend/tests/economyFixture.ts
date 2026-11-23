import type { EconomyView } from '../src/api/types';

export const date = { day: 60, year: 1212, month: 3, dayOfMonth: 1, label: '1212-03-01' };

const good = (basePrice: number, price: number, demand: number) =>
  ({ basePrice, price, stock: 10, outsideSupply: 5, outsideDemand: 4, demand, supplied: 5, left: 0 });

export const economyView: EconomyView = {
  date,
  settlements: [{
    settlementId: 'settlement:azgaar-burg:238', name: 'Vhaltha', population: 15747, economy: {
      marketId: 15, travelDays: 0, baselinePopulation: 15747, inventory: { Hemp: 0, Cloth: 2, Rations: 900000 },
      production: [
        { good: 'Cloth', source: 'workshop', units: 6, inputs: { Hemp: 6 }, produced: 0, limitedBy: 'Hemp' },
        { good: 'Sails', source: 'workshop', units: 5.75, inputs: { Cloth: 5.75 }, produced: 5.75, limitedBy: null },
      ],
      consumption: {}, bought: { Cloth: 5.75 }, sold: { Sails: 4 }, shortages: [{ good: 'Hemp', wanted: 6, obtained: 0 }],
      food: { ruralPopulation: 44619, hinterlandCells: 5, local: 238080, hinterland: 267714, eaten: 472410, wanted: 472410,
        security: 1, selfSufficiency: 1.07 },
      treasury: 120.5, tradeBalance: -3.2, taxPaid: 0, escortCost: 0, lostToBandits: 0,
    },
  }],
  markets: [{
    marketId: 15, centerSettlementId: 'settlement:azgaar-burg:238', centerName: 'Vhaltha', centerInScope: true,
    goods: { Hemp: good(0.32, 1.28, 22), Cloth: good(4.91, 5.5, 9), Rations: good(0.0006, 0.0006, 3000) },
    priceHistory: [{ day: 0, prices: { Hemp: 0.32, Cloth: 4.91 } }, { day: 30, prices: { Hemp: 0.8, Cloth: 5.2 } },
      { day: 60, prices: { Hemp: 1.28, Cloth: 5.5 } }],
    taxRates: { Sails: 0.1 }, taxRevenue: 12.5,
  }],
  caravans: [{ id: 'caravan:9', kind: 'purchase', marketId: 15, fromId: 'settlement:azgaar-burg:238', fromName: 'Vhaltha',
    toId: 'settlement:azgaar-burg:113', toName: 'Falanenerwin', cargo: { Wood: 2.5 }, value: 1.6, departDay: 60, arriveDay: 67,
    routeId: 'route:113:market:15', traderId: 'npc:trader:2', traderName: 'Keladren', guards: 3, lost: { Grain: 1 }, smuggled: 0, caught: false }],
  delivered: [],
  routes: [{ id: 'route:113:market:15', settlementId: 'settlement:azgaar-burg:113', settlementName: 'Falanenerwin', marketId: 15,
    centerName: 'Vhaltha', days: 7, bandits: 12, floor: 0, lair: null, raidChance: 0.155, guardsWanted: 4, recruits: 3, removed: 1,
    loot: {}, raids: 5, lootValue: 88.4, reserve: [] }],
  traders: [
    { id: 'npc:trader:1', name: 'Hamarlynnth', settlementId: 'settlement:azgaar-burg:113', settlementName: 'Falanenerwin',
      routeId: 'route:113:market:15', personality: { greed: 0.98, caution: 0.94, honesty: 0.98 }, busyUntil: 0, active: true, dismissedDay: null,
      scorecard: { trips: 20, valueCarried: 4000, commission: 120, taxPaid: 400, taxEvaded: 0, smuggled: 0, caught: 0, fines: 0, raids: 2,
        lossesValue: 30, guardsHired: 60, reputation: 92 } },
    { id: 'npc:trader:2', name: 'Keladren', settlementId: 'settlement:azgaar-burg:113', settlementName: 'Falanenerwin',
      routeId: 'route:113:market:15', personality: { greed: 0.75, caution: 0.69, honesty: 0.03 }, busyUntil: 74, active: false, dismissedDay: 50,
      scorecard: { trips: 8, valueCarried: 1500, commission: 40, taxPaid: 120, taxEvaded: 30, smuggled: 8, caught: 3, fines: 90, raids: 0,
        lossesValue: 0, guardsHired: 20, reputation: 11 } },
  ],
};
