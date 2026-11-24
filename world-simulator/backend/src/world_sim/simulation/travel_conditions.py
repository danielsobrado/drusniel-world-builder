"""Deterministic disruptions shared by parties and caravans using the same route."""

import random

from ..geography.paths import TravelPath


def route_delay(route: TravelPath, seed: int, day: int, cfg: dict) -> tuple[str, int] | None:
    sea = route.mode in ("sea", "mixed")
    kind = "storm" if sea else "road-closure"
    chance = cfg.get("stormChance" if sea else "closureChance", 0)
    corridor = route.sourceRouteIds[0] if route.sourceRouteIds else route.id
    # A disruption applies to everyone reaching this corridor in the same week.
    if random.Random(f"{seed}:{corridor}:{day // 7}:{kind}").random() < chance:
        return kind, cfg["delays"][kind]
    return None
