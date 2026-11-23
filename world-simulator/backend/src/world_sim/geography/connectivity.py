"""
Read-only settlement network built from imported Azgaar routes. Azgaar route points
carry the packed cell they cross ([x, y, cell]), so a route passes through a
settlement exactly when it crosses the settlement's cell. Points with no cell id fall
back to a coordinate tolerance and are flagged as such. Proximity is reported
separately and never counted as connectivity.
"""

import heapq
import math
from typing import Any

Key = int | str
Graph = dict[Key, dict[Key, float]]


def _round(value: float, digits: int) -> float:
    return float(f"{value:.{digits}f}")


def shortest_tree(graph: Graph, start: Key) -> tuple[dict[Key, float], dict[Key, Key]]:
    """Dijkstra over the cell graph: distances (map px) and predecessors from `start`."""
    dist: dict[Key, float] = {start: 0.0}
    prev: dict[Key, Key] = {}
    done: set[Key] = set()
    heap: list[tuple[float, int, Key]] = [(0.0, 0, start)]
    counter = 1  # tie-breaker keeps mixed int/str keys out of comparisons
    while heap:
        d, _, key = heapq.heappop(heap)
        if key in done:
            continue
        done.add(key)
        for nxt, length in graph.get(key, {}).items():
            candidate = d + length
            if candidate < dist.get(nxt, math.inf):
                dist[nxt] = candidate
                prev[nxt] = key
                heapq.heappush(heap, (candidate, counter, nxt))
                counter += 1
    return dist, prev


def shortest_distances(graph: Graph, start: Key) -> dict[Key, float]:
    return shortest_tree(graph, start)[0]


def path_cells(prev: dict[Key, Key], start: Key, end: Key) -> list[Key]:
    cells = [end]
    while cells[-1] != start:
        cells.append(prev[cells[-1]])
    return cells[::-1]


def _valid_point(point: Any) -> bool:
    return (isinstance(point, list) and len(point) >= 2
            and all(isinstance(v, (int, float)) and math.isfinite(v) for v in point[:2]))


def _node_key(point: list[Any], settlements: list[dict[str, Any]], tolerance: float) -> tuple[Key, str | None]:
    if len(point) > 2 and isinstance(point[2], int):
        return point[2], "cell"
    for s in settlements:
        if math.hypot(s["x"] - point[0], s["y"] - point[1]) <= tolerance:
            return s["cell"], "coordinate"
    return f"xy:{point[0]},{point[1]}", None


def _add_edge(graph: Graph, groups: dict[tuple[Key, Key], str], a: Key, b: Key, length: float, group: str) -> None:
    if a == b:
        return
    key = (a, b) if str(a) < str(b) else (b, a)
    if groups.get(key) != "roads":
        groups[key] = group
    for x, y in ((a, b), (b, a)):
        edges = graph.setdefault(x, {})
        if y not in edges or length < edges[y]:
            edges[y] = length


def _trace_route(route: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    stops: list[dict[str, Any]] = []
    segments: list[tuple[Key, Key, float]] = []
    along = 0.0
    previous: tuple[list[Any], Key] | None = None
    coordinate_matches = 0
    for point in route["points"]:
        if not _valid_point(point):
            continue
        key, match = _node_key(point, ctx["settlements"], ctx["tolerance"])
        ctx["positions"][key] = (point[0], point[1])
        if previous:
            length = math.hypot(point[0] - previous[0][0], point[1] - previous[0][1])
            along += length
            segments.append((previous[1], key, length))
        settlement = ctx["by_cell"].get(key)
        if settlement and (not stops or stops[-1]["settlementId"] != settlement["id"]):
            stops.append({"settlementId": settlement["id"], "along": along, "match": match})
            if match == "coordinate":
                coordinate_matches += 1
        previous = (point, key)
    return {"stops": stops, "segments": segments, "length": along, "coordinateMatches": coordinate_matches}


def build_settlement_connectivity(audit: dict[str, Any], routes: list[Any] | None, config: dict[str, Any]) -> dict[str, Any]:
    land_groups, sea_groups = config["landRouteGroups"], config["seaRouteGroups"]
    unit_scale = audit["sourceSettings"]["distanceScale"]
    settlements = audit["settlements"]
    by_cell = {s["cell"]: s for s in settlements}
    ctx = {"settlements": settlements, "by_cell": by_cell, "tolerance": config["coordinateTolerance"], "positions": {}}
    graph: Graph = {}
    sea_graph: Graph = {}            # shipping lanes, kept apart from the roads
    edge_groups: dict[tuple[Key, Key], str] = {}
    sea_groups_seen: dict[tuple[Key, Key], str] = {}
    links: dict[str, dict[str, list[dict[str, Any]]]] = {"land": {}, "sea": {}}
    route_records: list[dict[str, Any]] = []
    unresolved: list[dict[str, Any]] = []

    valid = [r for r in routes or [] if isinstance(r, dict) and isinstance(r.get("i"), int) and isinstance(r.get("points"), list)]
    for route in sorted(valid, key=lambda r: r["i"]):
        mode = "land" if route.get("group") in land_groups else "sea" if route.get("group") in sea_groups else None
        if not mode:
            continue
        trace = _trace_route(route, ctx)
        target, seen = (graph, edge_groups) if mode == "land" else (sea_graph, sea_groups_seen)
        for a, b, length in trace["segments"]:
            _add_edge(target, seen, a, b, length, route["group"])
        stops = trace["stops"]
        for a, b in zip(stops, stops[1:], strict=False):
            link = {"routeId": route["i"], "group": route["group"], "lengthPx": _round(b["along"] - a["along"], 2)}
            for frm, to in ((a["settlementId"], b["settlementId"]), (b["settlementId"], a["settlementId"])):
                links[mode].setdefault(frm, []).append({"settlementId": to, **link})
        route_records.append({
            "routeId": route["i"],
            "group": route["group"],
            "mode": mode,
            "lengthPx": _round(trace["length"], 2),
            "length": _round(trace["length"] * unit_scale, 1),
            "settlementIds": [s["settlementId"] for s in stops],
            "coordinateMatches": trace["coordinateMatches"],
            "points": [[_round(p[0], 1), _round(p[1], 1)] for p in route["points"] if _valid_point(p)],
        })
        if len(stops) < 2:
            unresolved.append({
                "routeId": route["i"],
                "group": route["group"],
                "settlementIds": [s["settlementId"] for s in stops],
                "reason": "crosses no settlement cell; joins the network only at junctions" if not stops
                else "crosses one settlement cell; other ends meet routes at junctions or stop short",
            })

    # Road components over the cell graph, so junctions between routes count.
    component_of: dict[Key, int] = {}
    components: list[list[dict[str, Any]]] = []
    for settlement in settlements:
        start = settlement["cell"]
        if start not in graph or start in component_of:
            continue
        index = len(components)
        component_of[start] = index
        queue, members = [start], []
        while queue:
            key = queue.pop()
            if key in by_cell:
                members.append(by_cell[key])
            for nxt in graph[key]:
                if nxt not in component_of:
                    component_of[nxt] = index
                    queue.append(nxt)
        components.append(members)
    ordered = sorted(
        ({"index": i, "members": sorted(m, key=lambda s: s["sourceId"])} for i, m in enumerate(components)),
        key=lambda c: (-len(c["members"]), c["members"][0]["sourceId"]),
    )
    component_name = {c["index"]: f"road-{rank + 1}" for rank, c in enumerate(ordered)}
    component_size = {c["index"]: len(c["members"]) for c in ordered}

    def sort_links(items: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
        return sorted(items or [], key=lambda link: (link["settlementId"], link["routeId"]))

    per_settlement = []
    for s in settlements:
        comp = component_of.get(s["cell"])
        nearby = sorted(
            ((math.hypot(o["x"] - s["x"], o["y"] - s["y"]), o) for o in settlements if o["id"] != s["id"]),
            key=lambda pair: (pair[0], pair[1]["id"]),
        )[: config["nearbyCount"]]
        per_settlement.append({
            "settlementId": s["id"],
            "roadComponentId": component_name.get(comp) if comp is not None else None,
            "roadConnected": comp is not None and component_size[comp] >= 2,
            "onLandRoute": comp is not None,
            "roadLinks": sort_links(links["land"].get(s["id"])),
            "seaLinks": sort_links(links["sea"].get(s["id"])),
            "nearby": [{
                "settlementId": o["id"],
                "distancePx": _round(d, 2),
                "distance": _round(d * unit_scale, 1),
                "sameRoadComponent": comp is not None and component_of.get(o["cell"]) == comp,
            } for d, o in nearby],
        })

    groups = sorted({r["group"] for r in route_records})
    return {
        "distanceUnit": audit["sourceSettings"]["distanceUnit"],
        "distanceScale": unit_scale,
        "landGraph": graph,
        "seaGraph": sea_graph,
        "edgeGroups": edge_groups,
        "cellPositions": ctx["positions"],
        "settlements": per_settlement,
        "components": [{
            "id": component_name[c["index"]],
            "settlementIds": [m["id"] for m in c["members"]],
            "size": len(c["members"]),
            "population": sum(m["population"] for m in c["members"]),
        } for c in ordered],
        "routes": route_records,
        "unresolvedRoutes": unresolved,
        "summary": {
            "landRoutes": sum(r["mode"] == "land" for r in route_records),
            "seaRoutes": sum(r["mode"] == "sea" for r in route_records),
            "routesByGroup": {g: sum(r["group"] == g for r in route_records) for g in groups},
            "roadComponents": len(ordered),
            "largestComponentSize": len(ordered[0]["members"]) if ordered else 0,
            "roadConnectedSettlements": sum(s["roadConnected"] for s in per_settlement),
            "isolatedSettlements": sum(not s["onLandRoute"] for s in per_settlement),
            "onlyLinkedBySea": sum(not s["onLandRoute"] and bool(s["seaLinks"]) for s in per_settlement),
            "unresolvedRoutes": len(unresolved),
            "coordinateMatches": sum(r["coordinateMatches"] for r in route_records),
        },
    }
