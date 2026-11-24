"""
Migration between the settlements of a scenario. Each month a town whose unemployment
is clearly above the scope's average sends a share of its idle adults to the town with
the lowest unemployment. Their children go with them, in the town's proportion of
children to adults; elders stay. Cohorts and population move with them, so the totals stay
exact; the named people who move are drawn from these flows, whole households without elders.
"""

from typing import Any

from ..peoples.catalog import NEUTRAL
from ..peoples.population import combined, transfer
from .contracts import SettlementState


def _rate(s: SettlementState) -> float:
    e = s.society.employment
    return e.unemployed / e.labourSupply if e.labourSupply else 0.0


def migrate(settlements: list[SettlementState], cfg: dict[str, Any]) -> tuple[list[SettlementState], dict[tuple[str, str], int]]:
    """Returns the settlements after this month's moves and the flows {(from, to): adults}; children follow their adults."""
    if len(settlements) < 2:
        return settlements, {}
    rates = {s.settlementId: _rate(s) for s in settlements}
    mean = sum(rates.values()) / len(rates)
    target = min(settlements, key=lambda s: (rates[s.settlementId], s.settlementId))
    flows: dict[tuple[str, str], int] = {}
    for s in sorted(settlements, key=lambda s: s.settlementId):
        if s is target or rates[s.settlementId] < mean + cfg["minRateGap"]:
            continue
        movers = min(s.cohorts.adults, int(s.society.employment.unemployed * cfg["shareOfIdlePerMonth"]))
        if movers > 0:
            flows[(s.settlementId, target.settlementId)] = movers
    if not flows:
        return settlements, {}
    by_id = {s.settlementId: s for s in settlements}
    kids = {pair: min(by_id[pair[0]].cohorts.children, round(n * by_id[pair[0]].cohorts.children / max(1, by_id[pair[0]].cohorts.adults)))
            for pair, n in flows.items()}
    groups = {s.settlementId: s.ancestries or {NEUTRAL: s.cohorts} for s in settlements}
    departures = {}
    for (origin, destination), adults in sorted(flows.items()):
        groups[origin], groups[destination], departures[origin] = transfer(
            groups[origin], groups[destination], adults, kids[(origin, destination)])
    out = []
    for s in settlements:
        gone = sum(n for (a, _), n in flows.items() if a == s.settlementId)
        came = sum(n for (_, b), n in flows.items() if b == s.settlementId)
        if not gone and not came:
            out.append(s)
            continue
        left = sum(n for (a, _), n in kids.items() if a == s.settlementId)
        arrived = sum(n for (_, b), n in kids.items() if b == s.settlementId)
        ancestry = groups[s.settlementId]
        cohorts = combined(ancestry)
        came, gone = came + arrived, gone + left
        vitals = s.vitals.model_copy(update={"immigrants": came, "emigrants": gone,
                                             "emigrantsByAncestry": departures.get(s.settlementId, {})})
        out.append(s.model_copy(update={"cohorts": cohorts, "ancestries": ancestry, "population": cohorts.total,
                                        "immigrants": s.immigrants + came, "emigrants": s.emigrants + gone, "vitals": vitals}))
    return out, flows
