"""
One month of the economy for every settlement in scope: caravans arrive and loot is
fenced, settlements produce and consume, markets clear, traders take caravans on the
road, bandit bands grow or shrink, and caravan-guard companies resize.
"""

from collections import defaultdict
from typing import Any

from ..contracts import Need, SettlementState, Society
from ..needs import status
from ..society import update_society
from .bandits import fence, update_bands
from .contracts import Caravan, FoodBalance, SettlementEconomy, Trade
from .escorts import KIND, resize_escorts
from .market import Clearing, Member
from .production import run_production, staffing
from .trips import TripContext, run_trip
from .turnover import household_month, turnover

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
    for r in trade.routes:
        for g, u in r.loot.items():
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


def _roads(settlements: list[SettlementState], trade: Trade, econs: dict[str, SettlementEconomy], new: list[Caravan], seed: int,
           day: int, cfg: dict[str, Any]) -> tuple[Trade, list[Caravan], list[dict[str, Any]]]:
    """Traders lead this month's caravans; returns the trade, the caravans as they left, and the incidents."""
    ctx = TripContext(seed=seed, day=day, cfg=cfg["economy"], markets={m.marketId: m for m in trade.markets}, econs=econs,
                      escorts_filled={s.settlementId: sum(b.filled for b in s.society.businesses if b.kind == KIND) for s in settlements},
                      safety={s.settlementId: next((n.value for n in s.society.needs if n.id == "safety"), 1.0) for s in settlements},
                      routes={r.id: r for r in trade.routes}, traders=list(trade.traders), trader_seq=trade.traderSeq)
    by_route: dict[str, list[Caravan]] = defaultdict(list)
    route_of = {(r.settlementId, r.marketId): r.id for r in trade.routes}
    for c in new:
        home = c.fromId if c.kind == "sale" else c.toId
        by_route[route_of.get((home, c.marketId), "")].append(c)
    led = [c for route_id, group in by_route.items() for c in (run_trip(ctx, ctx.routes[route_id], group) if route_id else group)]
    loot_before = {r.id: r.lootValue for r in trade.routes}
    markets = [m.model_copy(update={"taxRevenue": round(ctx.tax.get(m.marketId, 0.0), 2)}) for m in trade.markets]
    routes = list(ctx.routes.values())
    by_id = {s.settlementId: s.model_copy(update={"economy": econs[s.settlementId]}) for s in settlements}
    loot = {r.id: r.lootValue - loot_before[r.id] for r in routes}
    routes = update_bands(routes, by_id, {m.marketId: m for m in markets}, loot, seed, day, cfg["economy"])
    trade = trade.model_copy(update={"markets": markets, "routes": routes, "traders": ctx.traders, "traderSeq": ctx.trader_seq})
    return trade, led, ctx.incidents


def economy_month(settlements: list[SettlementState], trade: Trade, day: int, cfg: dict[str, Any],
                  seed: int = 0) -> tuple[list[SettlementState], Trade, dict[str, Any]]:
    before = _totals([s.economy for s in settlements], trade)
    econs = {s.settlementId: s.economy for s in settlements}
    trade = _deliver(trade, econs, day, cfg["economy"]["caravans"]["maxDelivered"])
    routes, markets = fence(trade.routes, trade.markets)
    trade = trade.model_copy(update={"routes": routes, "markets": markets})
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
    on_road, new = clearing.caravans[:len(clearing.caravans) - dispatched], clearing.caravans[len(clearing.caravans) - dispatched:]
    trade = trade.model_copy(update={"markets": markets, "caravanSeq": clearing.seq})
    econs = {m.settlement_id: m.econ.model_copy(update={"taxPaid": 0.0, "escortCost": 0.0, "lostToBandits": 0.0}) for m in members}
    trade, led, incidents = _roads(settlements, trade, econs, new, seed, day, cfg)
    trade = trade.model_copy(update={"caravans": on_road + led})

    filled = {b.id: b.filled for s in settlements for b in s.society.businesses}
    traders = household_month(trade.traders, econs, filled, cfg["economy"])
    updated = []
    for s in settlements:
        society = resize_escorts(s.society, s.settlementId, s.sourceId, s.name, trade.routes, cfg["economy"])
        restaff = society is not s.society
        home = {"id": s.settlementId, "sourceId": s.sourceId, "name": s.name, "class": econs[s.settlementId].settlementClass}
        society, econs[s.settlementId], traders, changes, opened = turnover(
            society, econs[s.settlementId], traders, settlement=home, day=day, cfg=cfg["economy"], society_cfg=cfg["society"])
        incidents.extend(changes)
        if restaff or opened:
            society = update_society(society, s.cohorts, cfg["society"])
        econ = econs[s.settlementId]
        updated.append(s.model_copy(update={"economy": econ, "society": with_food_need(society, econ, cfg)}))
    trade = trade.model_copy(update={"traders": traders})

    after = _totals(list(econs.values()), trade)
    count = sum(len(e.inventory) for e in econs.values()) + sum(len(m.goods) for m in trade.markets) + 4
    for g in set(before) | set(after):
        drift = after.get(g, 0.0) - before.get(g, 0.0) - flows.get(g, 0.0) - clearing.outside.get(g, 0.0)
        if abs(drift) > TOLERANCE * count:
            raise AssertionError(f"economy month {day}: {g} not conserved (drift {drift:.4f})")
    if any(u < 0 for e in econs.values() for u in e.inventory.values()):
        raise AssertionError(f"economy month {day}: negative inventory")
    return updated, trade, {
        "shortages": sum(len(e.shortages) for e in econs.values()),
        "caravans": dispatched,
        "tradeValue": round(sum(c.value for c in led), 2),
        "foodSecurity": round(min((e.food.security for e in econs.values()), default=1.0), 4),
        "bandits": sum(r.bandits for r in trade.routes),
        "raids": sum(1 for i in incidents if i["kind"] == "raid"),
        "caught": sum(1 for i in incidents if i["kind"] == "smuggling"),
        "incidents": incidents,
    }
