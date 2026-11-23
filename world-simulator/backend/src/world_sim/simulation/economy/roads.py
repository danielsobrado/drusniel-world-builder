"""Roads, their bandits, and the caravan masters who travel them, at a scenario's start."""

import math
import random
from typing import Any

from ...world.model import WorldModel
from .contracts import Market, Personality, Route, SettlementEconomy, Trader
from .names import generator_for
from .sources import AzgaarEconomy

RESERVE_NAMES = 8


def _lair(model: WorldModel, ends: list[dict[str, Any]], cfg: dict[str, Any]) -> tuple[int, str | None]:
    """A band founded by an Azgaar brigands marker near either end of the road, if there is one."""
    notes = {n.get("id"): n for n in model.document.get("notes") or [] if isinstance(n, dict)}
    for marker in model.document["pack"].get("markers") or []:
        if not isinstance(marker, dict) or marker.get("type") != "brigands":
            continue
        if any(math.dist((marker["x"], marker["y"]), (e["x"], e["y"])) <= cfg["markerRadiusPx"] for e in ends):
            return cfg["markerBand"], (notes.get(f"marker{marker['i']}") or {}).get("name") or "Brigands"
    return 0, None


def personality(rng: random.Random) -> Personality:
    return Personality(greed=round(rng.random(), 2), caution=round(rng.random(), 2), honesty=round(rng.random(), 2))


def initial_roads(model: WorldModel, members: list[tuple[dict[str, Any], SettlementEconomy]], markets: list[Market],
                  seed: int, cfg: dict[str, Any]) -> tuple[list[Route], list[Trader], list[Market]]:
    """One road per settlement that trades by caravan; `perRoute` traders on each; Azgaar tax rates on each market."""
    az = AzgaarEconomy(model)
    by_market = {m.marketId: m for m in markets}
    routes: list[Route] = []
    traders: list[Trader] = []
    for record, econ in members:
        market = by_market.get(econ.marketId)
        if market is None or econ.travelDays == 0:
            continue
        centre = model.settlements_by_id[market.centerSettlementId]
        band, lair = _lair(model, [record, centre], cfg["bandits"])
        names = generator_for(model.document, az.culture_of(record["sourceId"]))
        rng = random.Random(f"{seed}:road:{record['id']}")
        route = Route(id=f"route:{record['sourceId']}:market:{market.marketId}", settlementId=record["id"], settlementName=record["name"],
                      marketId=market.marketId, centerName=market.centerName, days=econ.travelDays, bandits=band,
                      floor=band // 3, lair=lair, reserve=[names.name(rng) for _ in range(RESERVE_NAMES)])
        for _ in range(cfg["traders"]["perRoute"]):
            traders.append(Trader(id=f"npc:trader:{len(traders) + 1}", name=names.name(rng), settlementId=record["id"],
                                  settlementName=record["name"], routeId=route.id, personality=personality(rng),
                                  scorecard={"reputation": cfg["traders"]["reputation"]["start"]}))
        routes.append(route)
    taxed = [m.model_copy(update={"taxRates": az.tax_rates(m.marketId)}) for m in markets]
    return routes, traders, taxed
