"""The economy at a scenario's start: each settlement's Azgaar production, stock and hinterland, and the markets they trade in."""

from collections import defaultdict
from typing import Any

from ...geography.paths import RoutePlanner
from ...ids import settlement_id
from ...world.model import WorldModel
from ..contracts import Society
from ..finance import baseline as initial_finances
from .contracts import FoodBalance, Market, MarketGood, PricePoint, SettlementEconomy, Trade
from .geography import hinterland
from .production import food_flows, monthly_use, r4, staffing
from .roads import initial_roads
from .sources import AzgaarEconomy


def initial_economy(model: WorldModel, settlements: list[tuple[dict[str, Any], int, Society]],
                    cfg: dict[str, Any], seed: int) -> tuple[list[SettlementEconomy], Trade]:
    """`settlements` holds (imported record, current population, society) for each settlement in scope."""
    e = cfg["economy"]
    rations = e["food"]["good"]
    az = AzgaarEconomy(model)
    travel = RoutePlanner(model, {**cfg["simulation"].get("travel", {}), **e["caravans"]})
    econs: list[SettlementEconomy] = []
    centres: dict[int, dict[str, Any]] = {}
    for record, population, society in settlements:
        lines = az.production(record["sourceId"], society.businesses)
        consumption = az.consumption(record["sourceId"], lines)
        market = az.market_of(record["sourceId"])
        centre = model.settlements_by_id.get(settlement_id(az.markets[market]["centerBurgId"])) if market else None
        path = travel.route(record, centre, off_road=True) if centre and centre["id"] != record["id"] else None
        if centre is None or (centre["id"] != record["id"] and path is None):
            market = None
        else:
            centres[market] = centre
        rural, cells = hinterland(model, record, e["food"]["hinterlandRadiusPx"])
        econ = SettlementEconomy(
            marketId=market, settlementClass=record["class"], travelDays=path.days if path else 0,
            baselinePopulation=record["population"],
            inventory={}, production=lines, consumption=consumption, food=FoodBalance(ruralPopulation=rural, hinterlandCells=cells),
            finances=initial_finances(sum(h.households for h in society.households), e.get("householdFinances", {})),
            treasury=float(az.burgs[record["sourceId"]].get("treasury") or 0))
        local, from_hinterland, wanted = food_flows(econ, society, population, cfg, record.get("rationMultiplier", 1))
        stock = {g: r4(u * e["settlement"]["targetMonths"]) for g, u in monthly_use(econ, population, staffing(society)).items()}
        stock[rations] = float(round(wanted / cfg["simulation"]["calendar"]["daysPerMonth"] * e["food"]["granary"]["initialDays"]))
        food = econ.food.model_copy(update={"local": local, "hinterland": from_hinterland, "eaten": wanted, "wanted": wanted,
                                            "selfSufficiency": round((local + from_hinterland) / wanted, 4) if wanted else 1.0})
        econs.append(econ.model_copy(update={"inventory": dict(sorted(stock.items())), "food": food}))

    scoped = {record["sourceId"] for record, _, _ in settlements}
    markets = []
    for market_id in sorted(centres):
        members = [(econ, pop * record.get("rationMultiplier", 1)) for econ, (record, pop, _)
                   in zip(econs, settlements, strict=True) if econ.marketId == market_id]
        goods = {g for econ, _ in members for line in econ.production for g in (line.good, *line.inputs)}
        goods |= {g for econ, _ in members for g in econ.consumption}
        flows = az.outside_flows(market_id, scoped, goods)
        # What members must buy each month: their use beyond their own output.
        net: dict[str, float] = defaultdict(float)
        for econ, (_, pop, society) in ((econ, row) for econ, row in zip(econs, settlements, strict=True) if econ.marketId == market_id):
            made = {line.good: line.units for line in econ.production}
            for g, units in monthly_use(econ, pop, staffing(society)).items():
                net[g] += max(0.0, units - made.get(g, 0.0))
        priced = {}
        for g in sorted(goods):
            price, recorded = az.market_good(market_id, g)
            # Azgaar's stock is a snapshot; starting below the market's target would open on a price spike.
            stock = max(recorded, r4((flows[g][1] + net[g]) * e["market"]["targetMonths"]))
            priced[g] = MarketGood(basePrice=price, price=price, stock=stock, outsideSupply=flows[g][0], outsideDemand=flows[g][1])
        daily = sum(pop * cfg["society"]["needs"]["rationsPerPersonDay"] for _, pop in members)
        ration_price = e["food"]["basePrice"] / e["food"]["priceUnit"]
        priced[rations] = MarketGood(basePrice=ration_price, price=ration_price, stock=round(daily * e["market"]["initialRationDays"]),
                                     outsideSupply=0, outsideDemand=0)
        centre = centres[market_id]
        markets.append(Market(marketId=market_id, centerSettlementId=centre["id"], centerName=centre["name"],
                              centerInScope=centre["sourceId"] in scoped, goods=priced,
                              priceHistory=[PricePoint(day=0, prices={g: mg.price for g, mg in priced.items()})]))
    routes, traders, markets = initial_roads(model, [(record, econ) for (record, _, _), econ in zip(settlements, econs, strict=True)],
                                             markets, seed, e, planner=travel)
    return econs, Trade(markets=markets, caravans=[], delivered=[], routes=routes, traders=traders, traderSeq=len(traders))
