"""
Bandit bands, one per road. They recruit from the home settlement's people without
work, and from the centre's (shared among its roads), more when hungry and after rich
loot; they lose men to patrols by the security
workers at both ends and to desertion, and fence last month's loot into the market.
"""

import math
import random
from typing import Any

from ..contracts import SettlementState
from .contracts import Market, Route


def _draw(rng: random.Random, expected: float) -> int:
    whole = math.floor(expected)
    return whole + (1 if rng.random() < expected - whole else 0)


def fence(routes: list[Route], markets: list[Market]) -> tuple[list[Route], list[Market]]:
    """Loot taken last month reaches the market through fences, as supply."""
    stock = {m.marketId: {g: mg.stock for g, mg in m.goods.items()} for m in markets}
    for r in routes:
        for g, u in r.loot.items():
            stock[r.marketId][g] += u
    markets = [m.model_copy(update={"goods": {g: mg.model_copy(update={"stock": round(stock[m.marketId][g], 4)})
                                              for g, mg in m.goods.items()}}) for m in markets]
    return [r.model_copy(update={"loot": {}}) if r.loot else r for r in routes], markets


def security_workers(s: SettlementState) -> int:
    return sum(b.filled for b in s.society.businesses if b.sector == "security")


def update_bands(routes: list[Route], settlements: dict[str, SettlementState], markets: dict[int, Market], loot: dict[str, float],
                 seed: int, day: int, cfg: dict[str, Any]) -> list[Route]:
    b = cfg["bandits"]
    roads_to = {m: sum(r.marketId == m for r in routes) for m in markets}
    out = []
    for r in routes:
        rng = random.Random(f"{seed}:{day}:{r.id}")
        home = settlements[r.settlementId]
        centre = settlements.get(markets[r.marketId].centerSettlementId)
        unemployed = home.society.employment.unemployed + (centre.society.employment.unemployed // roads_to[r.marketId] if centre else 0)
        shortfall = max(0.0, 1 - home.economy.food.security)
        affordability = max(0.0, 1 - home.economy.finances.foodAccess)
        pressure = 1 + b["hungerRecruitment"] * shortfall + b.get("affordabilityRecruitment", 0) * affordability
        recruits = _draw(rng, unemployed * b["recruitPerUnemployed"] * pressure
                         + b["lootRecruitment"] * loot.get(r.id, 0.0))
        guards = security_workers(home) + (security_workers(centre) if centre else 0)
        hazard = min(b["maxPatrolShare"], b["patrolPerSecurityWorker"] * guards) + b["desertion"]
        removed = min(r.bandits, _draw(rng, r.bandits * hazard))
        # Beyond a lair's floor, a band is never larger than the pool of idle people it comes from.
        bandits = max(r.floor, min(r.bandits + recruits - removed, r.floor + unemployed))
        out.append(r.model_copy(update={
            "bandits": bandits, "recruits": recruits, "removed": removed,
            "raidChance": round(1 - math.exp(-b["raidPerBanditDay"] * bandits * r.days), 4)}))
    return out
