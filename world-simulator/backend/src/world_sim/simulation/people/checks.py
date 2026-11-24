"""Rules the cast must keep after every month; returns the broken ones."""

from collections import Counter
from typing import Any

from ..contracts import SettlementState
from ..economy.contracts import Trade
from .contracts import Cast


def check_cast(cast: Cast, settlements: list[SettlementState], trade: Trade, cfg: dict[str, Any]) -> list[str]:
    """`cfg` is the people rules: the budget allowance (`maxOverBudget`) and the calendar's `daysPerYear`."""
    max_over = cfg["maxOverBudget"]
    broken = []
    alive = [p for p in cast.people if p.alive]
    counts = Counter(p.settlementId for p in alive)
    for s in settlements:
        budget = cast.budget.get(s.settlementId, 0)
        if not budget <= counts[s.settlementId] <= int(budget * (1 + max_over)):
            broken.append(f"{s.name} has {counts[s.settlementId]} named people, budget {budget}")
    households = {h.id for h in cast.households}
    if any(p.householdId not in households for p in cast.people):
        broken.append("a person belongs to no household")
    stock = {(s.settlementId, h.type): h for s in settlements for h in s.society.housing}
    built = Counter((d.settlementId, d.type) for d in cast.dwellings)
    if any(n > stock[k].buildings for k, n in built.items() if k in stock) or any(k not in stock for k in built):
        broken.append("more named dwellings than the housing stock has buildings")
    if any(len(d.households) > d.capacity for d in cast.dwellings):
        broken.append("a dwelling holds more households than it has room for")
    homes = {d.id for d in cast.dwellings}
    if any(h.homeId and h.homeId not in homes for h in cast.households):
        broken.append("a household lives in a dwelling that does not exist")
    filled = {b.id: b.filled for s in settlements for b in s.society.businesses}
    named = Counter(p.businessId for p in alive if p.role == "worker")
    if any(b not in filled or n > filled[b] for b, n in named.items()):
        broken.append("more named workers than filled posts, or a worker at a business that does not exist")
    holders = Counter(p.traderId for p in alive if p.role == "trader")
    active = {t.id for t in trade.traders if t.active}
    if any(n > 1 or t not in active for t, n in holders.items()):
        broken.append("a caravan post held twice, or by someone whose post is gone")
    if any((p.role == "trader") != bool(p.traderId) or (p.role == "outlaw") != bool(p.routeId) for p in alive):
        broken.append("a role without its link")
    broken += check_ties(cast, cfg["daysPerYear"])
    return broken


def check_ties(cast: Cast, year: int) -> list[str]:
    """Relationships stay consistent across deaths, births and household changes."""
    people = {p.id: p for p in cast.people}
    broken = []
    spouses = Counter()
    for r in cast.relationships:
        ends = [x for x in (r.a, r.b) if r.kind != "employer" or x == r.b]
        if any(x not in people for x in ends):
            broken.append(f"{r.id} links someone who is not in the cast")
            continue
        if r.kind == "spouse" and r.active:
            if not all(people[x].alive for x in (r.a, r.b)):
                broken.append(f"{r.id} is a marriage that outlived a spouse")
            spouses.update((r.a, r.b))
        if r.kind == "parent" and people[r.b].birthDay - people[r.a].birthDay < 14 * year:
            broken.append(f"{r.id}: a parent too young for their child")
        if r.kind in ("employer", "friend", "mentor", "rival", "spouse") and any(
                people[x].deathDay is not None and r.since > people[x].deathDay for x in ends):
            broken.append(f"{r.id} began after someone in it had died")
    if any(n > 1 for n in spouses.values()):
        broken.append("someone has two living spouses")
    return broken
