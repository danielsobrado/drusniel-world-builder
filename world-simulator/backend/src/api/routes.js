import {
  buildBudgetComparison,
  buildConnectivityReport,
  buildSummary,
  configFingerprint,
  settlementDetail,
  settlementRow,
  worldIdentity,
} from '../reports/ReportBuilder.js';
import { ApiError } from './responses.js';
import { parseSettlementQuery, querySettlements } from './settlementQuery.js';

const LIST_FIELDS = ['id', 'sourceId', 'name', 'stateId', 'stateName', 'cultureId', 'cultureName', 'population', 'class', 'capital', 'port', 'npcs', 'pilot'];
const pick = (row, fields) => Object.fromEntries(fields.map((f) => [f, row[f]]));

/** Precomputes the immutable payloads; handlers only read them. */
export function createRoutes(model) {
  const rows = model.audit.settlements.map((s) => settlementRow(model, s));
  const summary = buildSummary(model);
  const world = {
    ...worldIdentity(model),
    configFingerprint: configFingerprint(model.config),
    mapSize: model.audit.mapSize,
    counts: model.audit.counts,
    markers: rows.map((r) => ({ ...pick(r, ['id', 'sourceId', 'name', 'class', 'capital', 'port', 'population', 'npcs', 'pilot', 'stateId', 'cultureId']), x: model.settlementsById.get(r.id).x, y: model.settlementsById.get(r.id).y })),
  };
  const connectivity = (() => {
    const { settlements: _perSettlement, ...rest } = buildConnectivityReport(model);
    return rest;
  })();
  const budget = buildBudgetComparison(model);
  const pilot = {
    ...model.pilot,
    roles: model.pilot.roles.map((role) => ({ ...role, detail: settlementDetail(model, model.settlementsById.get(role.settlementId)) })),
  };
  const classIds = model.config.simulator.classification.map((c) => c.id);
  const bySourceId = new Map(model.audit.settlements.map((s) => [String(s.sourceId), s]));

  return [
    ['/api/health', () => ({ data: { status: 'ok' } })],
    ['/api/world', () => ({ data: world })],
    ['/api/world/summary', () => ({ data: summary })],
    ['/api/world/connectivity', () => ({ data: connectivity })],
    ['/api/world/npc-budget', () => ({ data: budget })],
    ['/api/world/pilot', () => ({ data: pilot })],
    ['/api/world/settlements', (url) => {
      const query = parseSettlementQuery(url.searchParams, model.config.simulator.api, classIds);
      const result = querySettlements(rows, query);
      return { data: result.items.map((r) => pick(r, LIST_FIELDS)), meta: { page: result.page, sort: query.sort, order: query.order } };
    }],
    [/^\/api\/world\/settlements\/([^/]+)$/, (url, match) => {
      const id = decodeURIComponent(match[1]);
      const settlement = model.settlementsById.get(id) ?? bySourceId.get(id);
      if (!settlement) throw new ApiError(404, 'not_found', `No settlement ${id}`, { id });
      return { data: settlementDetail(model, settlement) };
    }],
  ];
}

export function matchRoute(routes, pathname) {
  for (const [pattern, handler] of routes) {
    if (typeof pattern === 'string' ? pattern === pathname : pattern.test(pathname)) {
      return { handler, match: typeof pattern === 'string' ? null : pathname.match(pattern) };
    }
  }
  return null;
}
