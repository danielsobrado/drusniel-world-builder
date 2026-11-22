"""
Azgaar stores population in "points". Its UI converts them to inhabitants as
  burg:  population * populationRate * urbanization
  rural: cell.pop * populationRate
The game's SettlementProfile reads burg.population as thousands (correct only while
populationRate * urbanization = 1000); src/sim/import keeps the raw points.
The audit's canonical unit is inhabitants from the formulas above.
"""

import math
from typing import Any


def js_round(value: float) -> int:
    """Math.round semantics (half up), unlike Python's banker's rounding."""
    return math.floor(value + 0.5)


def population_scale(settings: dict[str, Any]) -> dict[str, float]:
    rate = float(settings["populationRate"])
    urbanization = float(settings["urbanization"])
    return {
        "populationRate": rate,
        "urbanization": urbanization,
        "urbanInhabitantsPerPoint": rate * urbanization,
        "ruralInhabitantsPerPoint": rate,
    }


def burg_inhabitants(points: Any, scale: dict[str, float]) -> int:
    return js_round(float(points) * scale["urbanInhabitantsPerPoint"])


def rural_inhabitants(cells: list[dict[str, Any]], scale: dict[str, float]) -> int:
    points = 0.0
    for cell in cells:
        try:
            points += float(cell.get("pop") or 0)
        except (TypeError, ValueError):
            pass
    return js_round(points * scale["ruralInhabitantsPerPoint"])


def interpretation_notes(scale: dict[str, float]) -> dict[str, Any]:
    return {
        "canonical": "inhabitants = burg.population * populationRate * urbanization",
        "gameRenderingAssumption": "SettlementProfile treats burg.population as thousands of inhabitants",
        "simulationProjection": "src/sim/import/projectAzgaarWorld.js stores raw burg.population points",
        "gameRenderingAgrees": scale["urbanInhabitantsPerPoint"] == 1000,
    }
