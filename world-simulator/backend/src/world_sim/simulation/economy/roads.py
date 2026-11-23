"""Roads, their bandits, and the caravan masters who travel them, at a scenario's start."""

import math
import random
from typing import Any

from ...world.model import WorldModel
from .contracts import Household, Market, Personality, Route, SettlementEconomy, Trader
from .geography import TravelTimes
from .names import generator_for
from .sources import AzgaarEconomy

RESERVE_NAMES = 8


def _lair(model: WorldModel, mode: str, path: list[tuple[float, float]], cfg: dict[str, Any]) -> tuple[int, str | None]:
    """A band founded by an Azgaar marker: brigands near either end of a road, pirates near any point of a sea lane."""
    notes = {n.get("id"): n for n in model.document.get("notes") or [] if isinstance(n, dict)}
    kind, radius = ("brigands", cfg["markerRadiusPx"]) if mode == "land" else ("pirates", cfg["pirateRadiusPx"])
    points = path if mode == "sea" else path[:1] + path[-1:]
    for marker in model.document["pack"].get("markers") or []:
        if not isinstance(marker, dict) or marker.get("type") != kind:
            continue
        if any(math.dist((marker["x"], marker["y"]), p) <= radius for p in points):
            default = "Brigands" if mode == "land" else "Pirates"
            return cfg["markerBand"], (notes.get(f"marker{marker['i']}") or {}).get("name") or default
    return 0, None


def personality(rng: random.Random) -> Personality:
    return Personality(greed=round(rng.random(), 2), caution=round(rng.random(), 2), honesty=round(rng.random(), 2))


def new_trader(trader_id: str, name: str, settlement_id: str, settlement_name: str, route_id: str, rng: random.Random,
               cfg: dict[str, Any], day: int = 0) -> Trader:
    """A caravan master with a seeded personality, household and starting purse."""
    low, high = cfg["traders"]["savings"]
    return Trader(id=trader_id, name=name, settlementId=settlement_id, settlementName=settlement_name, routeId=route_id,
                  personality=personality(rng), household=Household(adults=rng.choice((1, 2, 2, 2)), children=rng.randint(0, 4)),
                  purse=round(rng.uniform(low, high), 2), scorecard={"reputation": cfg["traders"]["reputation"]["start"]}, busyUntil=day)


def initial_roads(model: WorldModel, members: list[tuple[dict[str, Any], SettlementEconomy]], markets: list[Market],
                  seed: int, cfg: dict[str, Any]) -> tuple[list[Route], list[Trader], list[Market]]:
    """One road per settlement that trades by caravan; `perRoute` traders on each; Azgaar tax rates on each market."""
    az = AzgaarEconomy(model)
    travel = TravelTimes(model, cfg["caravans"])
    by_market = {m.marketId: m for m in markets}
    routes: list[Route] = []
    traders: list[Trader] = []
    for record, econ in members:
        market = by_market.get(econ.marketId)
        if market is None or econ.travelDays == 0:
            continue
        centre = model.settlements_by_id[market.centerSettlementId]
        mode, _, path = travel.trip(record, centre)
        band, lair = _lair(model, mode, path, cfg["bandits"])
        names = generator_for(model.document, az.culture_of(record["sourceId"]))
        rng = random.Random(f"{seed}:road:{record['id']}")
        route = Route(id=f"route:{record['sourceId']}:market:{market.marketId}", mode=mode,
                      settlementId=record["id"], settlementName=record["name"],
                      marketId=market.marketId, centerName=market.centerName, days=econ.travelDays, bandits=band,
                      floor=band // 3, lair=lair, reserve=[names.name(rng, cfg["traders"]["nameLength"]) for _ in range(RESERVE_NAMES)])
        for _ in range(cfg["traders"]["perRoute"]):
            name = names.name(rng, cfg["traders"]["nameLength"])
            traders.append(new_trader(f"npc:trader:{len(traders) + 1}", name, record["id"], record["name"], route.id, rng, cfg))
        routes.append(route)
    taxed = [m.model_copy(update={"taxRates": az.tax_rates(m.marketId)}) for m in markets]
    return routes, traders, taxed
