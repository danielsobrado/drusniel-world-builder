"""Where a settlement's food and caravans come from: its rural hinterland and its road distance to the market centre."""

import math
from typing import Any

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
