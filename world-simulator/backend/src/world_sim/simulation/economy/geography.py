"""Where a settlement's food and caravans come from: its rural hinterland and its road distance to the market centre."""

import math
from typing import Any

from ...geography.connectivity import path_cells, shortest_tree
from ...world.model import WorldModel
from ...world.population import js_round


def hinterland(model: WorldModel, settlement: dict[str, Any], radius: float) -> tuple[int, int]:
    """Rural inhabitants and cells within `radius` px whose nearest settlement (of all on the map) is this one."""
    others = model.audit["settlements"]
    near = [o for o in others if math.dist((o["x"], o["y"]), (settlement["x"], settlement["y"])) <= 2 * radius]
    per_point = model.audit["sourceSettings"]["ruralInhabitantsPerPoint"]
    points, cells = 0.0, 0
    for cell in model.document["pack"]["cells"]:
        pop = cell.get("pop") or 0
        if pop <= 0 or (cell.get("h") or 0) < 20 or math.dist(cell["p"], (settlement["x"], settlement["y"])) > radius:
            continue
        nearest = min(near, key=lambda o: (math.dist(cell["p"], (o["x"], o["y"])), o["sourceId"]))
        if nearest["id"] == settlement["id"]:
            points, cells = points + pop, cells + 1
    return js_round(points * per_point), cells


class TravelTimes:
    """Caravan days between settlements: by road (or overland) and, between ports on a sea route, by ship."""

    def __init__(self, model: WorldModel, cfg: dict[str, Any]):
        self.land = model.connectivity["landGraph"]
        self.sea = model.connectivity.get("seaGraph") or {}
        self.positions = model.connectivity["cellPositions"]
        self.scale = model.audit["sourceSettings"]["distanceScale"]
        self.cfg = cfg
        self.cache: dict[tuple[str, Any], tuple[dict[Any, float], dict[Any, Any]]] = {}

    def _tree(self, mode: str, cell: Any) -> tuple[dict[Any, float], dict[Any, Any]]:
        if (mode, cell) not in self.cache:
            self.cache[(mode, cell)] = shortest_tree(self.land if mode == "land" else self.sea, cell)
        return self.cache[(mode, cell)]

    def trip(self, a: dict[str, Any], b: dict[str, Any]) -> tuple[str, int, list[tuple[float, float]]]:
        """(mode, days, path positions); the quicker of road and sea, overland where no road connects."""
        if a["id"] == b["id"]:
            return "land", 0, []
        px = self._tree("land", a["cell"])[0].get(b["cell"], math.inf) if a["cell"] in self.land else math.inf
        if not math.isfinite(px):
            px = math.dist((a["x"], a["y"]), (b["x"], b["y"])) * self.cfg["offRoadFactor"]
        land_days = max(1, math.ceil(px * self.scale / self.cfg["milesPerDay"]))
        if a.get("port") and b.get("port") and a["cell"] in self.sea:
            dist, prev = self._tree("sea", a["cell"])
            if b["cell"] in dist:
                sea_days = max(1, math.ceil(dist[b["cell"]] * self.scale / self.cfg["shipMilesPerDay"]))
                if sea_days < land_days:
                    path = [self.positions[k] for k in path_cells(prev, a["cell"], b["cell"]) if k in self.positions]
                    return "sea", sea_days, path
        return "land", land_days, [(a["x"], a["y"]), (b["x"], b["y"])]

    def days(self, a: dict[str, Any], b: dict[str, Any]) -> int:
        return self.trip(a, b)[1]
