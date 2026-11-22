/**
 * Read-only settlement network built from imported Azgaar routes. Azgaar route
 * points carry the packed cell they cross ([x, y, cell]), so a route passes
 * through a settlement exactly when it crosses the settlement's cell. Points with
 * no cell id fall back to a coordinate tolerance and are flagged as such.
 * Proximity is reported separately and never counted as connectivity.
 */
const round = (value, digits) => Number(value.toFixed(digits));

function nodeKey(point, settlementsByCell, settlements, tolerance) {
  if (Number.isInteger(point[2])) return { key: point[2], match: 'cell' };
  const near = settlements.find((s) => Math.hypot(s.x - point[0], s.y - point[1]) <= tolerance);
  if (near) return { key: near.cell, match: 'coordinate' };
  return { key: `xy:${point[0]},${point[1]}`, match: null };
}

function addEdge(graph, a, b, length) {
  if (a === b) return;
  for (const [from, to] of [[a, b], [b, a]]) {
    if (!graph.has(from)) graph.set(from, new Map());
    const current = graph.get(from).get(to);
    if (current == null || length < current) graph.get(from).set(to, length);
  }
}

/** Shortest road distances (map px) from one cell to every reachable cell. */
export function shortestDistances(graph, startKey) {
  const dist = new Map([[startKey, 0]]);
  const done = new Set();
  const heap = [[0, startKey]];
  const push = (item) => {
    heap.push(item);
    for (let i = heap.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (heap[parent][0] <= heap[i][0]) break;
      [heap[parent], heap[i]] = [heap[i], heap[parent]];
      i = parent;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length > 0) {
      heap[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  while (heap.length > 0) {
    const [d, key] = pop();
    if (done.has(key)) continue;
    done.add(key);
    for (const [next, length] of graph.get(key) ?? []) {
      const candidate = d + length;
      if (candidate < (dist.get(next) ?? Infinity)) {
        dist.set(next, candidate);
        push([candidate, next]);
      }
    }
  }
  return dist;
}

function traceRoute(route, ctx) {
  const stops = [];
  const segments = [];
  let along = 0;
  let previous = null;
  let coordinateMatches = 0;
  for (const point of route.points) {
    if (!Array.isArray(point) || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue;
    const node = nodeKey(point, ctx.settlementsByCell, ctx.settlements, ctx.tolerance);
    if (previous) {
      const length = Math.hypot(point[0] - previous.point[0], point[1] - previous.point[1]);
      along += length;
      segments.push([previous.key, node.key, length]);
    }
    const settlement = ctx.settlementsByCell.get(node.key);
    if (settlement && stops.at(-1)?.settlementId !== settlement.id) {
      stops.push({ settlementId: settlement.id, along, match: node.match });
      if (node.match === 'coordinate') coordinateMatches += 1;
    }
    previous = { point, key: node.key };
  }
  return { stops, segments, length: along, coordinateMatches };
}

export function buildSettlementConnectivity(audit, routes, config) {
  const { landRouteGroups, seaRouteGroups, coordinateTolerance, nearbyCount } = config;
  const unitScale = audit.sourceSettings.distanceScale;
  const unit = audit.sourceSettings.distanceUnit;
  const settlements = audit.settlements;
  const settlementsByCell = new Map(settlements.map((s) => [s.cell, s]));
  const ctx = { settlements, settlementsByCell, tolerance: coordinateTolerance };
  const landGraph = new Map();
  const links = { land: new Map(), sea: new Map() };
  const routeRecords = [];
  const unresolvedRoutes = [];

  const sorted = [...(routes ?? [])].filter((r) => r && Number.isInteger(r.i) && Array.isArray(r.points)).sort((a, b) => a.i - b.i);
  for (const route of sorted) {
    const mode = landRouteGroups.includes(route.group) ? 'land' : seaRouteGroups.includes(route.group) ? 'sea' : null;
    if (!mode) continue;
    const trace = traceRoute(route, ctx);
    if (mode === 'land') for (const [a, b, length] of trace.segments) addEdge(landGraph, a, b, length);
    for (let i = 1; i < trace.stops.length; i += 1) {
      const a = trace.stops[i - 1];
      const b = trace.stops[i];
      const link = { routeId: route.i, group: route.group, lengthPx: round(b.along - a.along, 2) };
      for (const [from, to] of [[a.settlementId, b.settlementId], [b.settlementId, a.settlementId]]) {
        if (!links[mode].has(from)) links[mode].set(from, []);
        links[mode].get(from).push({ settlementId: to, ...link });
      }
    }
    routeRecords.push({
      routeId: route.i,
      group: route.group,
      mode,
      lengthPx: round(trace.length, 2),
      length: round(trace.length * unitScale, 1),
      settlementIds: trace.stops.map((s) => s.settlementId),
      coordinateMatches: trace.coordinateMatches,
      points: route.points.map((p) => [round(p[0], 1), round(p[1], 1)]),
    });
    if (trace.stops.length < 2) {
      unresolvedRoutes.push({ routeId: route.i, group: route.group, settlementIds: trace.stops.map((s) => s.settlementId), reason: trace.stops.length === 0 ? 'crosses no settlement cell; joins the network only at junctions' : 'crosses one settlement cell; other ends meet routes at junctions or stop short' });
    }
  }

  // Road components over the cell graph, so junctions between routes count.
  const componentOfCell = new Map();
  const components = [];
  for (const settlement of settlements) {
    if (!landGraph.has(settlement.cell) || componentOfCell.has(settlement.cell)) continue;
    const queue = [settlement.cell];
    const index = components.length;
    componentOfCell.set(settlement.cell, index);
    const members = [];
    while (queue.length > 0) {
      const key = queue.pop();
      if (settlementsByCell.has(key)) members.push(settlementsByCell.get(key));
      for (const next of landGraph.get(key).keys()) {
        if (!componentOfCell.has(next)) { componentOfCell.set(next, index); queue.push(next); }
      }
    }
    components.push(members);
  }
  const ordered = components
    .map((members, index) => ({ index, members: members.sort((a, b) => a.sourceId - b.sourceId) }))
    .sort((a, b) => b.members.length - a.members.length || a.members[0].sourceId - b.members[0].sourceId);
  const componentId = new Map(ordered.map((c, rank) => [c.index, `road-${rank + 1}`]));

  const bySettlement = settlements.map((s) => {
    const component = componentOfCell.has(s.cell) ? componentId.get(componentOfCell.get(s.cell)) : null;
    const componentSize = component ? ordered.find((c) => componentId.get(c.index) === component).members.length : 0;
    const nearby = settlements
      .filter((o) => o.id !== s.id)
      .map((o) => ({ settlementId: o.id, distancePx: Math.hypot(o.x - s.x, o.y - s.y), cell: o.cell }))
      .sort((a, b) => a.distancePx - b.distancePx || a.settlementId.localeCompare(b.settlementId))
      .slice(0, nearbyCount)
      .map((o) => ({
        settlementId: o.settlementId,
        distancePx: round(o.distancePx, 2),
        distance: round(o.distancePx * unitScale, 1),
        sameRoadComponent: component != null && componentOfCell.get(o.cell) === componentOfCell.get(s.cell),
      }));
    const sortLinks = (list) => [...(list ?? [])].sort((a, b) => a.settlementId.localeCompare(b.settlementId) || a.routeId - b.routeId);
    return {
      settlementId: s.id,
      roadComponentId: component,
      roadConnected: componentSize >= 2,
      onLandRoute: component != null,
      roadLinks: sortLinks(links.land.get(s.id)),
      seaLinks: sortLinks(links.sea.get(s.id)),
      nearby,
    };
  });

  return {
    distanceUnit: unit,
    distanceScale: unitScale,
    landGraph,
    settlements: bySettlement,
    components: ordered.map((c) => ({
      id: componentId.get(c.index),
      settlementIds: c.members.map((m) => m.id),
      size: c.members.length,
      population: c.members.reduce((sum, m) => sum + m.population, 0),
    })),
    routes: routeRecords,
    unresolvedRoutes,
    summary: {
      landRoutes: routeRecords.filter((r) => r.mode === 'land').length,
      seaRoutes: routeRecords.filter((r) => r.mode === 'sea').length,
      routesByGroup: Object.fromEntries([...new Set(routeRecords.map((r) => r.group))].sort().map((g) => [g, routeRecords.filter((r) => r.group === g).length])),
      roadComponents: ordered.length,
      largestComponentSize: ordered[0]?.members.length ?? 0,
      roadConnectedSettlements: bySettlement.filter((s) => s.roadConnected).length,
      isolatedSettlements: bySettlement.filter((s) => !s.onLandRoute).length,
      onlyLinkedBySea: bySettlement.filter((s) => !s.onLandRoute && s.seaLinks.length > 0).length,
      unresolvedRoutes: unresolvedRoutes.length,
      coordinateMatches: routeRecords.reduce((sum, r) => sum + r.coordinateMatches, 0),
    },
  };
}
