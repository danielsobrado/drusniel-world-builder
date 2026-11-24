"""Route geometry shared by migration and market travel."""

import math
from typing import Literal

from pydantic import BaseModel, ConfigDict

from .connectivity import path_cells, shortest_tree

Mode = Literal["land", "sea", "mixed", "off-road"]


class TravelPath(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    id: str
    fromId: str
    toId: str
    mode: Mode
    days: int
    distance: float
    unit: str
    points: list[tuple[float, float]]
    sourceRouteIds: list[int] = []

    def reverse(self) -> "TravelPath":
        return self.model_copy(update={"fromId": self.toId, "toId": self.fromId, "points": self.points[::-1]})


class RoutePlanner:
    """Shortest travel time through Azgaar cells. Land and sea meet only at ports."""

    def __init__(self, model, cfg: dict):
        network = model.connectivity
        self.positions = network["cellPositions"]
        self.source = network["edgeSources"]
        self.unit = network["distanceUnit"]
        self.scale = network["distanceScale"]
        self.cfg = cfg
        self.graph = {}
        self.overland = None
        self.overland_trees = {}
        cells = model.document["pack"]["cells"]
        self.cells = cells
        speed_unit = 1.609344 if self.unit.lower() in {"km", "kilometer", "kilometers"} else 1.0
        self.speed_unit = speed_unit
        for mode, key, configured_speed in (
            ("land", "landGraph", cfg["milesPerDay"]),
            ("sea", "seaGraph", cfg["shipMilesPerDay"]),
        ):
            graph = network[key]
            for cell, edges in graph.items():
                self.graph[(mode, cell)] = {
                    (mode, nxt): distance * self.scale / (configured_speed * speed_unit)
                    * self._slope(cells, mode, cell, nxt) for nxt, distance in edges.items()
                }
        for settlement in model.audit["settlements"]:
            land, sea = ("land", settlement["cell"]), ("sea", settlement["cell"])
            if settlement["port"] and sea in self.graph:
                self.graph.setdefault(land, {})[sea] = cfg.get("portTransferDays", 0.25)
                self.graph[sea][land] = cfg.get("portTransferDays", 0.25)
        self.trees = {}

    def _slope(self, cells, mode, a, b) -> float:
        if mode != "land" or type(a) is not int or type(b) is not int or not (0 <= a < len(cells) and 0 <= b < len(cells)):
            return 1
        low, high = sorted((cells[a].get("h") or 0, cells[b].get("h") or 0))
        return 1 + max(0, high - max(low, self.cfg.get("mountainHeight", 60))) * self.cfg.get("mountainPenalty", 0.012)

    def route(self, a: dict, b: dict, *, off_road: bool = False) -> TravelPath | None:
        origin, destination = (a["x"], a["y"]), (b["x"], b["y"])
        start, end = ("land", a["cell"]), ("land", b["cell"])
        if start not in self.trees:
            self.trees[start] = shortest_tree(self.graph, start)
        distances, previous = self.trees[start]
        if end not in distances:
            if not off_road:
                return None
            on_land = self._overland(a["cell"], b["cell"])
            if not on_land:
                return None
            days, cells = on_land
            mode, sources, points = "off-road", [], [origin, *(self.cells[cell]["p"] for cell in cells), destination]
        else:
            nodes = path_cells(previous, start, end)
            points = [origin, *(self.positions[cell] for _, cell in nodes if cell in self.positions), destination]
            days = distances[end]
            traversed = [(m, x, y) for (m, x), (n, y) in zip(nodes, nodes[1:], strict=False) if m == n]
            modes = {m for m, _, _ in traversed}
            mode = "mixed" if len(modes) > 1 else next(iter(modes), "land")
            sources = sorted({self.source[(m, x, y)] for m, x, y in traversed})
        points = [tuple(point) for point in points]
        points = [p for i, p in enumerate(points) if i == 0 or p != points[i - 1]]
        distance = sum(math.dist(x, y) for x, y in zip(points, points[1:], strict=False)) * self.scale
        rid = "travel:" + ":".join(sorted((str(a["sourceId"]), str(b["sourceId"]))))
        return TravelPath(id=rid, fromId=a["id"], toId=b["id"], mode=mode, days=max(1, math.ceil(days)),
                          distance=round(distance, 2), unit=self.unit, points=points, sourceRouteIds=sources)


    def _overland(self, start: int, end: int) -> tuple[float, list[int]] | None:
        """Book off-road commerce only where neighboring dry cells form a continuous path."""
        if self.overland is None:
            dry = {cell["i"]: cell for cell in self.cells if (cell.get("h") or 0) >= 20 and cell.get("p")}
            pace = self.scale * self.cfg["offRoadFactor"] / (self.cfg["milesPerDay"] * self.speed_unit)
            self.overland = {i: {
                j: math.dist(cell["p"], dry[j]["p"]) * pace * self._slope(self.cells, "land", i, j)
                for j in cell.get("c", []) if j in dry
            } for i, cell in dry.items()}
        if start not in self.overland or end not in self.overland:
            return None
        if start not in self.overland_trees:
            self.overland_trees[start] = shortest_tree(self.overland, start)
        days, prev = self.overland_trees[start]
        return (days[end], path_cells(prev, start, end)) if end in days else None


def build_routes(model, settlement_ids: list[str], cfg: dict) -> list[TravelPath]:
    """Keep routes within the scenario's journey horizon using the full imported network."""
    planner = RoutePlanner(model, {**cfg, "milesPerDay": cfg["walkingMilesPerDay"]})
    towns = [model.settlements_by_id[sid] for sid in sorted(settlement_ids)]
    routes = []
    for index, town in enumerate(towns):
        for other in towns[index + 1:]:
            path = planner.route(town, other)
            if path and path.days <= cfg["maxDays"]:
                routes.append(path)
    return routes
