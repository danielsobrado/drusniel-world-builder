"""
Monthly market clearing. Each Azgaar market sits at its centre burg. Members sell what
they hold above their target stock and buy what they lack, as far as their treasury, this
month's sales and their credit allow (food first); every sale and purchase
travels as a caravan unless the member is the centre itself. Members outside the
scenario's scope and other markets trade as Azgaar recorded them, more or less as
prices move. Scarce stock is shared pro rata, and prices follow stock against demand.
"""

from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from .contracts import Caravan, Market, MarketGood, PricePoint, SettlementEconomy, Trade
from .production import EPS, monthly_use, r4


@dataclass
class Member:
    settlement_id: str
    name: str
    population: int
    ratios: dict[str, float]
    econ: SettlementEconomy


def targets(m: Member, cfg: dict[str, Any]) -> dict[str, float]:
    e = cfg["economy"]
    months = e["settlement"]["targetMonths"]
    out = {g: u * months for g, u in monthly_use(m.econ, m.population, m.ratios).items()}
    out[e["food"]["good"]] = m.population * cfg["society"]["needs"]["rationsPerPersonDay"] * e["food"]["granary"]["targetDays"]
    return out


def affordable(want: dict[str, float], prices: dict[str, float], budget: float, food: str) -> dict[str, float]:
    """What a member can pay for out of `budget`: food first, then every other good scaled down alike."""
    if sum(u * prices[g] for g, u in want.items()) <= budget:
        return want
    out = {}
    if food in want:
        out[food] = min(want[food], max(0.0, budget) / prices[food])
        budget -= out[food] * prices[food]
    rest = sum(u * prices[g] for g, u in want.items() if g != food)
    scale = min(1.0, max(0.0, budget) / rest) if rest > EPS else 0.0
    out |= {g: u * scale for g, u in want.items() if g != food}
    return {g: u for g, u in out.items() if u > EPS}


def _new_price(good: MarketGood, demand: float, stock: float, mc: dict[str, Any]) -> float:
    wanted = demand * mc["targetMonths"]
    low, high = mc["priceBounds"]
    if wanted > EPS:
        factor = min(high, max(low, (wanted / max(stock, EPS)) ** mc["priceElasticity"]))
    else:
        factor = low if stock > EPS else 1.0    # a glut with no buyers, or no trade at all
    goal = good.basePrice * factor
    return round(max(good.basePrice * low, good.price + mc["priceSmoothing"] * (goal - good.price)), 6)


class Clearing:
    """Clears every market of one month; collects caravans and the outside flows for the conservation check."""

    def __init__(self, trade: Trade, day: int, cfg: dict[str, Any]):
        self.day, self.cfg = day, cfg
        self.caravans = list(trade.caravans)
        self.seq = trade.caravanSeq
        self.outside: dict[str, float] = defaultdict(float)   # net goods entering the scope from outside

    def _caravan(self, kind: str, market: Market, m: Member, cargo: dict[str, float], prices: dict[str, float]) -> None:
        self.seq += 1
        here = (m.settlement_id, m.name)
        centre = (market.centerSettlementId, market.centerName)
        (from_id, from_name), (to_id, to_name) = (here, centre) if kind == "sale" else (centre, here)
        self.caravans.append(Caravan(
            id=f"caravan:{self.seq}", kind=kind, marketId=market.marketId, fromId=from_id, fromName=from_name, toId=to_id,
            toName=to_name, cargo=cargo, value=round(sum(u * prices[g] for g, u in cargo.items()), 2),
            departDay=self.day, arriveDay=self.day + m.econ.travelDays))

    def clear(self, market: Market, members: list[Member]) -> Market:
        mc = self.cfg["economy"]["market"]
        prices = {g: mg.price for g, mg in market.goods.items()}
        stock = {g: mg.stock for g, mg in market.goods.items()}
        supplied: dict[str, float] = defaultdict(float)
        requests: dict[str, dict[str, float]] = {}
        inventories: dict[str, dict[str, float]] = {}
        sold_by: dict[str, dict[str, float]] = {}
        for m in members:
            target = targets(m, self.cfg)
            inv = dict(m.econ.inventory)
            sale, want = {}, {}
            for g in market.goods:
                have, keep = inv.get(g, 0.0), target.get(g, 0.0)
                if have - keep > EPS:
                    sale[g] = r4(have - keep)
                    inv[g] = r4(have - sale[g])
                elif keep - have > EPS:
                    want[g] = keep - have
            if mc.get("credit") is not None:     # absent in rules frozen before it existed: unlimited, as they ran
                budget = m.econ.treasury + mc["credit"] + sum(u * prices[g] for g, u in sale.items())
                want = affordable(want, prices, budget, self.cfg["economy"]["food"]["good"])
            if sale and m.econ.travelDays == 0:
                for g, u in sale.items():
                    stock[g] += u
                    supplied[g] += u
            elif sale:
                self._caravan("sale", market, m, sale, prices)
            inventories[m.settlement_id], requests[m.settlement_id], sold_by[m.settlement_id] = inv, want, sale

        goods: dict[str, MarketGood] = {}
        bought: dict[str, dict[str, float]] = defaultdict(dict)
        elastic = mc["outsideElasticity"]
        for g, mg in market.goods.items():
            relative = mg.price / mg.basePrice
            outside_supply = mg.outsideSupply * relative ** elastic["supply"]
            outside_demand = mg.outsideDemand * relative ** -elastic["demand"]
            stock[g] += outside_supply
            supplied[g] += outside_supply
            asked = sum(r.get(g, 0.0) for r in requests.values())
            demand = asked + outside_demand
            share = min(1.0, stock[g] / demand) if demand > EPS else 0.0
            for sid, r in requests.items():
                units = r4(r.get(g, 0.0) * share)
                if units > EPS:
                    bought[sid][g] = units
                    stock[g] -= units
            taken = min(stock[g], outside_demand * share)
            stock[g] -= taken
            left = max(0.0, stock[g] - mc["maxStockMonths"] * demand)
            stock[g] -= left
            self.outside[g] += outside_supply - taken - left
            goods[g] = mg.model_copy(update={"stock": r4(max(0.0, stock[g])), "demand": r4(demand), "supplied": r4(supplied[g]),
                                             "left": r4(left), "price": _new_price(mg, demand, stock[g], mc)})

        for m in members:
            sid, inv, cargo = m.settlement_id, inventories[m.settlement_id], bought.get(m.settlement_id, {})
            if cargo and m.econ.travelDays == 0:
                for g, u in cargo.items():
                    inv[g] = r4(inv.get(g, 0.0) + u)
            elif cargo:
                self._caravan("purchase", market, m, cargo, prices)
            balance = sum(u * prices[g] for g, u in sold_by[sid].items()) - sum(u * prices[g] for g, u in cargo.items())
            m.econ = m.econ.model_copy(update={"inventory": inv, "sold": sold_by[sid], "bought": cargo, "tradeBalance": round(balance, 2),
                                               "treasury": round(m.econ.treasury + balance, 2)})

        history = [*market.priceHistory, PricePoint(day=self.day, prices={g: goods[g].price for g in sorted(goods)})]
        return market.model_copy(update={"goods": goods, "priceHistory": history[-mc["maxPricePoints"]:]})
