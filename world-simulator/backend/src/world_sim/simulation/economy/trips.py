"""
Each month's caravans on the road. A settlement's outbound sale and returning purchase
are one trip, led by one of its caravan masters. The master's personality sets the
escort (caution, less for greed) and how much cargo is hidden from the market tax
(greed against honesty, held back by caution and by having been caught before). On
the road bandits may raid; at the gate the centre's guards may find the hidden cargo.
"""

import math
import random
from dataclasses import dataclass, field
from typing import Any

from .contracts import Caravan, Market, Route, SettlementEconomy, Trader
from .production import r4
from .roads import new_trader


@dataclass
class TripContext:
    seed: int
    day: int
    cfg: dict[str, Any]
    markets: dict[int, Market]
    econs: dict[str, SettlementEconomy]
    escorts_filled: dict[str, int]       # caravan-guard posts filled per settlement this month
    safety: dict[str, float]             # the safety need of settlements in scope
    routes: dict[str, Route]
    traders: list[Trader]
    trader_seq: int
    tax: dict[int, float] = field(default_factory=dict)
    incidents: list[dict[str, Any]] = field(default_factory=list)


def _value(cargo: dict[str, float], prices: dict[str, float]) -> float:
    return sum(u * prices[g] for g, u in cargo.items())


def _charge(ctx: TripContext, sid: str, amount: float, **fields: float) -> None:
    e = ctx.econs[sid]
    update = {k: round(getattr(e, k) + v, 2) for k, v in fields.items()}
    update |= {"treasury": round(e.treasury - amount, 2), "tradeBalance": round(e.tradeBalance - amount, 2)}
    ctx.econs[sid] = e.model_copy(update=update)


def _pick(ctx: TripContext, route: Route) -> Trader:
    crew = [t for t in ctx.traders if t.active and t.routeId == route.id]
    free = [t for t in crew if t.busyUntil <= ctx.day]
    # Work is shared by reputation: the next trip goes to whoever has the fewest trips for their standing.
    if not free:
        return min(crew, key=lambda t: (t.busyUntil, t.id))
    return min(free, key=lambda t: (t.scorecard.trips / max(5.0, t.scorecard.reputation), t.id))


def _raid(ctx: TripContext, route: Route, caravan: Caravan, guards: int, prices: dict[str, float]) -> tuple[Caravan, float]:
    b = ctx.cfg["bandits"]
    chance = 1 - math.exp(-b["raidPerBanditDay"] * route.bandits * route.days / (1 + b["guardDeterrence"] * guards))
    if not route.bandits or random.Random(f"{ctx.seed}:{caravan.id}:road").random() >= chance:
        return caravan, 0.0
    share = b["lootShare"] * route.bandits / (route.bandits + b["guardStrength"] * guards)
    lost = {g: r4(u * share) for g, u in caravan.cargo.items() if u * share > 1e-4}
    loot = dict(route.loot)
    for g, u in lost.items():
        loot[g] = r4(loot.get(g, 0.0) + u)
    value = _value(lost, prices)
    ctx.routes[route.id] = route.model_copy(update={"loot": loot, "raids": route.raids + 1,
                                                    "lootValue": round(route.lootValue + value, 2)})
    cargo = {g: r4(u - lost.get(g, 0.0)) for g, u in caravan.cargo.items()}
    return caravan.model_copy(update={"cargo": cargo, "lost": lost, "value": round(_value(cargo, prices), 2)}), value


def _gate(ctx: TripContext, trader: Trader, caravan: Caravan, market: Market) -> tuple[Caravan, dict[str, float]]:
    """Tax on the sale; returns the caravan and the money owed (tax, confiscated, fine, evaded)."""
    s, p = ctx.cfg["smuggling"], trader.personality
    prices = {g: mg.price for g, mg in market.goods.items()}
    rates = {g: market.taxRates.get(g, s["defaultTaxRate"]) for g in caravan.cargo}
    tax = sum(u * prices[g] * rates[g] for g, u in caravan.cargo.items())
    safety = min(1.5, ctx.safety.get(market.centerSettlementId, 1.0))
    t = ctx.cfg["traders"]
    debt = t["debtPressure"] * min(1.0, max(0.0, -trader.purse) / t["debtScale"])
    wish = (p.greed - p.honesty) * 1.5 + debt - p.caution * s["inspection"] * safety
    hidden = max(0.0, min(s["maxHidden"], wish)) * s["learning"] ** trader.scorecard.caught
    if hidden <= 0.01:
        return caravan, {"tax": tax, "confiscated": 0.0, "fine": 0.0, "evaded": 0.0}
    caught = random.Random(f"{ctx.seed}:{caravan.id}:gate").random() < s["inspection"] * safety * math.sqrt(hidden)
    smuggled = _value(caravan.cargo, prices) * hidden
    evaded = tax * hidden
    caravan = caravan.model_copy(update={"smuggled": round(smuggled, 2), "caught": caught})
    if caught:
        return caravan, {"tax": tax - evaded, "confiscated": smuggled, "fine": evaded * s["fineMultiplier"], "evaded": 0.0}
    return caravan, {"tax": tax, "confiscated": 0.0, "fine": 0.0, "evaded": evaded}


def _replace(ctx: TripContext, trader: Trader, route: Route) -> None:
    """A master whose reputation falls too low is let go; the next name in the road's reserve takes over."""
    ctx.traders = [t.model_copy(update={"active": False, "dismissedDay": ctx.day}) if t.id == trader.id else t for t in ctx.traders]
    ctx.trader_seq += 1
    reserve = list(route.reserve)
    name = reserve.pop(0) if reserve else f"Trader {ctx.trader_seq}"
    ctx.routes[route.id] = ctx.routes[route.id].model_copy(update={"reserve": reserve})
    ctx.traders.append(new_trader(f"npc:trader:{ctx.trader_seq}", name, trader.settlementId, trader.settlementName, route.id,
                                  random.Random(f"{ctx.seed}:hire:{ctx.trader_seq}"), ctx.cfg, ctx.day))
    ctx.incidents.append({"kind": "dismissed", "message": f"{trader.name} of {trader.settlementName} was let go after their "
                          f"reputation fell to {trader.scorecard.reputation:.0f}; a new master will be taken on", "trader": trader.id,
                          "settlementId": trader.settlementId, "routeId": route.id,
                          "facts": {"reputation": trader.scorecard.reputation, "timesCaught": trader.scorecard.caught},
                          "effects": [{"entityId": trader.id, "kind": "lost-post", "severity": 1.0}]})


def run_trip(ctx: TripContext, route: Route, caravans: list[Caravan]) -> list[Caravan]:
    """Leads this month's caravans on one road; updates economies, the road, the market's tax and the trader."""
    cfg, e = ctx.cfg, ctx.cfg["escorts"]
    market = ctx.markets[route.marketId]
    prices = {g: mg.price for g, mg in market.goods.items()}
    trader = _pick(ctx, route)
    p, card = trader.personality, trader.scorecard
    wanted = round(p.caution * (e["base"] + e["perBandit"] * route.bandits) * (1 - 0.5 * p.greed))
    guards = min(wanted, ctx.escorts_filled.get(route.settlementId, 0))
    ctx.routes[route.id] = route.model_copy(update={"guardsWanted": wanted})
    sid = route.settlementId
    _charge(ctx, sid, guards * e["feePerGuardDay"] * 2 * route.days, escortCost=guards * e["feePerGuardDay"] * 2 * route.days)

    out, lost_value, delivered, money = [], 0.0, 0.0, {"tax": 0.0, "confiscated": 0.0, "fine": 0.0, "evaded": 0.0}
    for caravan in caravans:
        caravan = caravan.model_copy(update={"routeId": route.id, "traderId": trader.id, "traderName": trader.name, "guards": guards})
        caravan, lost = _raid(ctx, ctx.routes[route.id], caravan, guards, prices)
        lost_value += lost
        if caravan.kind == "sale":
            _charge(ctx, sid, lost, lostToBandits=lost)      # paid on dispatch for goods that never arrived
            caravan, money = _gate(ctx, trader, caravan, market)
            _charge(ctx, sid, money["tax"] + money["evaded"] + money["confiscated"], taxPaid=money["tax"])
            delivered += _value(caravan.cargo, prices) - money["confiscated"]
        else:
            ctx.econs[sid] = ctx.econs[sid].model_copy(update={"lostToBandits": round(ctx.econs[sid].lostToBandits + lost, 2)})
            delivered += _value(caravan.cargo, prices)
        out.append(caravan)
    ctx.tax[market.marketId] = ctx.tax.get(market.marketId, 0.0) + money["tax"] + money["fine"] + money["confiscated"]
    if market.centerSettlementId in ctx.econs:
        _charge(ctx, market.centerSettlementId, -(money["tax"] + money["fine"] + money["confiscated"]))
    commission = cfg["traders"]["commission"] * delivered
    _charge(ctx, sid, commission)

    rep = cfg["traders"]["reputation"]
    caught = any(c.caught for c in out)
    reputation = card.reputation + (rep["caught"] if caught else 0) + (rep["raided"] if lost_value else 0)
    reputation += rep["safeTrip"] if not caught and not lost_value else 0
    card = card.model_copy(update={
        "trips": card.trips + 1, "valueCarried": round(card.valueCarried + delivered + lost_value, 2),
        "commission": round(card.commission + commission, 2),
        "taxPaid": round(card.taxPaid + money["tax"], 2), "taxEvaded": round(card.taxEvaded + money["evaded"], 2),
        "smuggled": card.smuggled + any(c.smuggled for c in out), "caught": card.caught + caught,
        "fines": round(card.fines + money["fine"], 2), "raids": card.raids + bool(lost_value),
        "lossesValue": round(card.lossesValue + lost_value, 2), "guardsHired": card.guardsHired + guards,
        "reputation": round(max(0.0, min(100.0, reputation)), 1)})
    purse = trader.purse + commission + money["evaded"] - money["fine"]
    trader = trader.model_copy(update={"scorecard": card, "busyUntil": ctx.day + 2 * route.days, "purse": round(purse, 2)})
    ctx.traders = [trader if t.id == trader.id else t for t in ctx.traders]
    if lost_value:
        band = f" ({route.lair})" if route.lair else ""
        who, way = ("Pirates", "sea lane") if route.mode == "sea" else ("Bandits", "road")
        raided = [c for c in out if c.lost]
        carried = sum(c.value for c in out) + lost_value
        ctx.incidents.append({"kind": "raid", "message": f"{who}{band} on the {route.settlementName} {way} robbed {trader.name}'s caravan "
                              f"of {lost_value:,.1f} in goods ({guards} guard{'' if guards == 1 else 's'})",
                              "trader": trader.id, "value": round(lost_value, 2), "guards": guards,
                              "settlementId": route.settlementId, "routeId": route.id, "locationId": route.id,
                              "caravanId": raided[0].id if raided else None, "relatedEntities": [c.id for c in raided],
                              "facts": {"cargoLost": round(lost_value, 2), "cargoUnit": "market value", "guardsPresent": guards,
                                        "bandSize": route.bandits, "mode": route.mode},
                              "effects": [{"entityId": trader.id, "kind": "trade-loss",
                                           "severity": round(min(1.0, lost_value / carried), 3) if carried else 1.0},
                                          {"entityId": route.settlementId, "kind": "goods-lost", "severity": 0.1}]})
    if caught:
        ctx.incidents.append({"kind": "smuggling", "message": f"{trader.name} of {trader.settlementName} was caught smuggling at "
                              f"{market.centerName}: goods worth {money['confiscated']:,.1f} confiscated, fined {money['fine']:,.1f}",
                              "trader": trader.id, "value": round(money["confiscated"], 2),
                              "settlementId": market.centerSettlementId, "routeId": route.id, "locationId": market.centerSettlementId,
                              "relatedEntities": [c.id for c in out if c.caught],
                              "facts": {"confiscated": round(money["confiscated"], 2), "fine": round(money["fine"], 2)},
                              "effects": [{"entityId": trader.id, "kind": "fined", "severity": 0.5}]})
    if card.reputation < rep["dismissBelow"]:
        _replace(ctx, trader, ctx.routes[route.id])
    return out
