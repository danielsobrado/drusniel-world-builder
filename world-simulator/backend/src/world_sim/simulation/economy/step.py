"""One month of the economy for every settlement in scope: caravans arrive, settlements produce and consume, markets clear."""

from collections import defaultdict
from typing import Any

from ..contracts import Need, SettlementState, Society
from ..needs import status
from .contracts import FoodBalance, SettlementEconomy, Trade
from .market import Clearing, Member
from .production import run_production, staffing

TOLERANCE = 1e-3   # per stored quantity: inventories and stock are kept to four decimals


def _totals(econs: list[SettlementEconomy], trade: Trade) -> dict[str, float]:
    total: dict[str, float] = defaultdict(float)
    for e in econs:
        for g, u in e.inventory.items():
            total[g] += u
    for market in trade.markets:
        for g, mg in market.goods.items():
            total[g] += mg.stock
    for c in trade.caravans:
        for g, u in c.cargo.items():
            total[g] += u
    return total


def _deliver(trade: Trade, econs: dict[str, SettlementEconomy], day: int, keep: int) -> Trade:
    """Caravans due by `day` unload: purchases into the settlement, sales into the market's stock."""
    markets = {m.marketId: {g: mg.stock for g, mg in m.goods.items()} for m in trade.markets}
    arrived = [c for c in trade.caravans if c.arriveDay <= day]
    for c in arrived:
        if c.kind == "purchase":
            inv = dict(econs[c.toId].inventory)
            for g, u in c.cargo.items():
                inv[g] = round(inv.get(g, 0.0) + u, 4)
            econs[c.toId] = econs[c.toId].model_copy(update={"inventory": inv})
        else:
            for g, u in c.cargo.items():
                markets[c.marketId][g] += u
    return trade.model_copy(update={
        "markets": [m.model_copy(update={"goods": {g: mg.model_copy(update={"stock": round(markets[m.marketId][g], 4)})
                                                   for g, mg in m.goods.items()}}) for m in trade.markets],
        "caravans": [c for c in trade.caravans if c.arriveDay > day],
        "delivered": [*trade.delivered, *arrived][-keep:],
    })


def food_need(food: FoodBalance, granary: float, cfg: dict[str, Any]) -> Need:
    daily = food.wanted / cfg["economy"]["azgaar"]["turnDays"] if food.wanted else 0
    days = f"{granary / daily:,.0f}" if daily else "—"
    return Need(id="food", label="Food", value=food.security, status=status(food.security, cfg["society"]["needs"]["thresholds"]),
                explanation=f"Ate {food.eaten:,} of {food.wanted:,} rations: {food.local:,} grown in town, {food.hinterland:,} sent by "
                            f"{food.ruralPopulation:,} rural neighbours, the rest from the granary and market. Granary holds {days} days.")


def with_food_need(society: Society, econ: SettlementEconomy, cfg: dict[str, Any]) -> Society:
    need = food_need(econ.food, econ.inventory.get(cfg["economy"]["food"]["good"], 0.0), cfg)
    return society.model_copy(update={"needs": [need, *(n for n in society.needs if n.id != "food")]})


def economy_month(settlements: list[SettlementState], trade: Trade, day: int,
                  cfg: dict[str, Any]) -> tuple[list[SettlementState], Trade, dict[str, Any]]:
    before = _totals([s.economy for s in settlements], trade)
    econs = {s.settlementId: s.economy for s in settlements}
    trade = _deliver(trade, econs, day, cfg["economy"]["caravans"]["maxDelivered"])
    flows: dict[str, float] = defaultdict(float)
    members = []
    for s in settlements:
        econ, flow = run_production(econs[s.settlementId], s.society, s.population, cfg)
        for g, u in flow.items():
            flows[g] += u
        members.append(Member(s.settlementId, s.name, s.population, staffing(s.society), econ))

    clearing = Clearing(trade, day, cfg)
    markets = [clearing.clear(market, [m for m in members if m.econ.marketId == market.marketId]) for market in trade.markets]
    dispatched = clearing.seq - trade.caravanSeq
    trade = trade.model_copy(update={"markets": markets, "caravans": clearing.caravans, "caravanSeq": clearing.seq})
    by_id = {m.settlement_id: m.econ for m in members}
    updated = [s.model_copy(update={"economy": by_id[s.settlementId], "society": with_food_need(s.society, by_id[s.settlementId], cfg)})
               for s in settlements]

    after = _totals(list(by_id.values()), trade)
    count = sum(len(e.inventory) for e in by_id.values()) + sum(len(m.goods) for m in markets) + 4
    for g in set(before) | set(after):
        drift = after.get(g, 0.0) - before.get(g, 0.0) - flows.get(g, 0.0) - clearing.outside.get(g, 0.0)
        if abs(drift) > TOLERANCE * count:
            raise AssertionError(f"economy month {day}: {g} not conserved (drift {drift:.4f})")
    if any(u < 0 for e in by_id.values() for u in e.inventory.values()):
        raise AssertionError(f"economy month {day}: negative inventory")
    return updated, trade, {
        "shortages": sum(len(e.shortages) for e in by_id.values()),
        "caravans": dispatched,
        "tradeValue": round(sum(c.value for c in clearing.caravans[len(clearing.caravans) - dispatched:]), 2) if dispatched else 0,
        "foodSecurity": round(min((e.food.security for e in by_id.values()), default=1.0), 4),
    }
