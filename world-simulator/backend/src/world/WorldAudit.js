import {
  importedCultureId,
  importedRegionProvinceId,
  importedRegionStateId,
  importedSettlementId,
} from '../../../../src/sim/model/ids.js';
import { burgInhabitants, interpretationNotes, populationScale, ruralInhabitants } from './PopulationNormalizer.js';
import { classDistribution, classifySettlement } from './SettlementClassifier.js';

const CIVIC_FEATURES = ['citadel', 'walls', 'plaza', 'temple', 'shanty', 'port'];

const active = (records) => records.filter((r) => r && r.i > 0 && !r.removed);

function invalidReason(burg, cellCount) {
  if (typeof burg.name !== 'string' || burg.name.trim() === '') return 'missing name';
  if (!Number.isFinite(burg.x) || !Number.isFinite(burg.y)) return 'non-finite coordinates';
  if (!Number.isFinite(Number(burg.population)) || Number(burg.population) < 0) return 'invalid population';
  if (!Number.isInteger(burg.cell) || burg.cell < 0 || burg.cell >= cellCount) return 'cell out of range';
  return null;
}

function goodsEvidence(burg, goodsById) {
  const extracted = new Map();
  const crafted = new Map();
  for (const entry of burg.production ?? []) {
    const good = goodsById.get(entry?.goodId);
    if (!good) continue;
    const target = Array.isArray(entry.recipe) && entry.recipe.length > 0 ? crafted : extracted;
    target.set(good.name, { name: good.name, tags: [...(good.tags ?? [])].sort() });
  }
  const sorted = (map) => [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { extractedGoods: sorted(extracted), craftedGoods: sorted(crafted) };
}

function settlementRecord(burg, ctx) {
  const cell = ctx.cells[burg.cell];
  const state = ctx.states.get(burg.state);
  const province = ctx.provinces.get(cell.province);
  const culture = ctx.cultures.get(burg.culture);
  const population = burgInhabitants(burg.population, ctx.scale);
  const civic = Object.fromEntries(CIVIC_FEATURES.map((key) => [key, Number(burg[key]) > 0]));
  const market = ctx.marketsByCenter.get(burg.i);
  return {
    id: importedSettlementId(burg.i),
    sourceId: burg.i,
    name: burg.name.trim(),
    x: burg.x,
    y: burg.y,
    cell: burg.cell,
    stateId: state ? importedRegionStateId(state.i) : null,
    stateName: state?.name ?? 'Neutral lands',
    provinceId: province ? importedRegionProvinceId(province.i) : null,
    provinceName: province?.name ?? null,
    cultureId: culture ? importedCultureId(culture.i) : null,
    cultureName: culture?.name ?? null,
    capital: Number(burg.capital) > 0,
    port: civic.port,
    population,
    populationPoints: Number(burg.population),
    class: classifySettlement(population, ctx.classes).id,
    azgaarType: burg.type ?? null,
    azgaarGroup: burg.group ?? null,
    civicFeatures: CIVIC_FEATURES.filter((key) => civic[key]),
    geography: {
      biome: ctx.biomeNames[cell.biome] ?? null,
      heightIndex: cell.h,
      coastal: cell.t === 1,
      riverCell: Number(cell.r) > 0,
      feature: cell.f,
    },
    economy: { ...goodsEvidence(burg, ctx.goodsById), marketCenter: market != null, marketId: market?.i ?? null },
  };
}

function regionSummaries(records, key, settlements) {
  return records.map((r) => {
    const members = settlements.filter((s) => s[key] === r.id);
    return { ...r, settlementCount: members.length, settlementPopulation: members.reduce((sum, s) => sum + s.population, 0) };
  });
}

/** Immutable world facts and normalized population; the source document is only read. */
export function buildWorldAudit({ identity, document }, simulatorConfig) {
  const { pack, settings } = document;
  const scale = populationScale(settings);
  const classes = simulatorConfig.classification;
  const ctx = {
    scale,
    classes,
    cells: pack.cells,
    states: new Map(active(pack.states).map((s) => [s.i, s])),
    provinces: new Map(active(pack.provinces).map((p) => [p.i, p])),
    cultures: new Map(pack.cultures.filter((c) => c && !c.removed).map((c) => [c.i, c])),
    goodsById: new Map((pack.goods ?? []).filter(Boolean).map((g) => [g.i, g])),
    marketsByCenter: new Map((pack.markets ?? []).filter((m) => m?.centerBurgId > 0).map((m) => [m.centerBurgId, m])),
    biomeNames: document.biomesData?.name ?? [],
  };

  const invalidRecords = [];
  let removedCount = 0;
  const settlements = [];
  for (const burg of pack.burgs) {
    if (!burg || !(burg.i > 0)) continue; // index 0 is Azgaar's empty placeholder
    if (burg.removed) { removedCount += 1; continue; }
    const reason = invalidReason(burg, pack.cells.length);
    if (reason) invalidRecords.push({ sourceId: burg.i, name: burg.name ?? null, reason });
    else settlements.push(settlementRecord(burg, ctx));
  }
  settlements.sort((a, b) => a.sourceId - b.sourceId);

  const urbanPopulation = settlements.reduce((sum, s) => sum + s.population, 0);
  const ruralPopulation = ruralInhabitants(pack.cells, scale);
  const states = regionSummaries([...ctx.states.values()].map((s) => ({
    id: importedRegionStateId(s.i), sourceId: s.i, name: s.name, fullName: s.fullName ?? s.name, color: s.color ?? null,
    ruralPopulation: Math.round(Number(s.rural ?? 0) * scale.ruralInhabitantsPerPoint),
  })), 'stateId', settlements);
  const provinces = regionSummaries([...ctx.provinces.values()].map((p) => ({
    id: importedRegionProvinceId(p.i), sourceId: p.i, name: p.name, stateId: p.state > 0 ? importedRegionStateId(p.state) : null,
  })), 'provinceId', settlements);
  const cultures = regionSummaries([...ctx.cultures.values()].map((c) => ({
    id: importedCultureId(c.i), sourceId: c.i, name: c.name,
  })), 'cultureId', settlements);

  const observed = { settlements: settlements.length, provinces: provinces.length, states: states.length, cultures: cultures.length };
  const reference = simulatorConfig.world.referenceCounts?.[identity.mapId] ?? null;

  return Object.freeze({
    identity,
    sourceSettings: { ...scale, distanceUnit: settings.distanceUnit ?? null, distanceScale: Number(settings.distanceScale) || 1, year: settings.options?.year ?? null, era: settings.options?.era ?? null },
    mapSize: { width: document.info.width, height: document.info.height },
    populationInterpretation: interpretationNotes(scale),
    counts: observed,
    referenceCheck: reference && Object.fromEntries(Object.entries(reference).map(([key, expected]) => [key, { expected, observed: observed[key], matches: expected === observed[key] }])),
    population: { named: urbanPopulation, rural: ruralPopulation, total: urbanPopulation + ruralPopulation },
    classDistribution: classDistribution(settlements, classes),
    invalidRecords,
    removedCount,
    settlements,
    states,
    provinces,
    cultures,
  });
}
