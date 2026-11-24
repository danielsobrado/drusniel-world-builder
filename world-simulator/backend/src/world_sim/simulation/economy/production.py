"""
One month of a settlement's own economy: Azgaar production lines worked by their staff
and limited by inputs in stock, rations from its farms and hinterland, then consumption.
Records what was short. Trade happens afterwards in the market.
"""

from collections import defaultdict
from typing import Any

from ..contracts import Society
from .contracts import SettlementEconomy, Shortage

EPS = 1e-9


def r4(x: float) -> float:
    return round(x, 4)


def staffing(society: Society) -> dict[str, float]:
    """Share of posts filled in the businesses working each good."""
    posts: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for b in society.businesses:
        if b.good:
            posts[b.good][0] += b.filled
            posts[b.good][1] += b.staff
    return {g: filled / staff for g, (filled, staff) in posts.items() if staff}


def monthly_use(econ: SettlementEconomy, population: int, ratios: dict[str, float]) -> dict[str, float]:
    """Goods a settlement wants each month: its own use scaled by population, plus inputs at its staffing."""
    scale = population / econ.baselinePopulation if econ.baselinePopulation else 0
    use: dict[str, float] = defaultdict(float, {g: u * scale for g, u in econ.consumption.items()})
    for line in econ.production:
        for good, units in line.inputs.items():
            use[good] += units * ratios.get(line.good, 1.0)
    return dict(use)


def food_flows(econ: SettlementEconomy, society: Society, population: int, cfg: dict[str, Any],
               ration_multiplier: float = 1) -> tuple[int, int, int]:
    """(local, hinterland, wanted) rations for one month."""
    days = cfg["simulation"]["calendar"]["daysPerMonth"]
    needs = cfg["society"]["needs"]
    farm = sum(b.filled for b in society.businesses if b.sector == "agriculture")
    local = round(farm * needs["rationsPerFarmWorkerDay"] * days)
    hinterland = round(econ.food.ruralPopulation * cfg["economy"]["food"]["ruralSurplusPerPersonDay"] * days)
    return local, hinterland, round(population * needs["rationsPerPersonDay"] * days * ration_multiplier)


def run_production(econ: SettlementEconomy, society: Society, population: int,
                   cfg: dict[str, Any], ration_multiplier: float = 1) -> tuple[SettlementEconomy, dict[str, float]]:
    """Returns the updated economy and the month's net flow per good (produced minus used and eaten)."""
    rations = cfg["economy"]["food"]["good"]
    inv: dict[str, float] = defaultdict(float, econ.inventory)
    flow: dict[str, float] = defaultdict(float)
    wanted: dict[str, float] = defaultdict(float)
    got: dict[str, float] = defaultdict(float)
    ratios = staffing(society)
    lines = []
    for line in econ.production:
        target = line.units * ratios.get(line.good, 1.0)
        limited = "staff" if target < line.units - EPS else None
        frac = 1.0
        # A restored snapshot orders dictionary keys canonically. Break equally scarce inputs the same way.
        for good, units in sorted(line.inputs.items()):
            need = units * target / line.units if line.units else 0
            wanted[good] += need
            if need > EPS and inv[good] < need * frac:
                frac, limited = inv[good] / need, good
        out = target * frac
        for good, units in line.inputs.items():
            use = min(inv[good], units * out / line.units) if line.units else 0
            inv[good] -= use
            got[good] += use
            flow[good] -= use
        inv[line.good] += out
        flow[line.good] += out
        lines.append(line.model_copy(update={"produced": r4(out), "limitedBy": limited}))

    local, hinterland, ration_need = food_flows(econ, society, population, cfg, ration_multiplier)
    inv[rations] += local + hinterland
    flow[rations] += local + hinterland
    scale = population / econ.baselinePopulation if econ.baselinePopulation else 0
    for good, units in [*((g, u * scale) for g, u in econ.consumption.items()), (rations, ration_need)]:
        take = min(units, inv[good])
        inv[good] -= take
        got[good] += take
        flow[good] -= take
        wanted[good] += units

    threshold = cfg["economy"]["shortage"]["threshold"]
    shortages = [Shortage(good=g, wanted=r4(wanted[g]), obtained=r4(got[g])) for g in sorted(wanted)
                 if wanted[g] > EPS and got[g] / wanted[g] < threshold]
    eaten = round(got[rations])
    food = econ.food.model_copy(update={
        "local": local, "hinterland": hinterland, "eaten": eaten, "wanted": ration_need,
        "security": round(eaten / ration_need, 4) if ration_need else 1.0,
        "selfSufficiency": round((local + hinterland) / ration_need, 4) if ration_need else 1.0,
    })
    inventory = {g: r4(u) for g, u in sorted(inv.items())}
    return econ.model_copy(update={"inventory": inventory, "production": lines, "shortages": shortages, "food": food}), dict(flow)
