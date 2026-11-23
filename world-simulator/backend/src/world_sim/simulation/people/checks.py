"""Rules the cast must keep after every month; returns the broken ones."""

from collections import Counter

from ..contracts import SettlementState
from ..economy.contracts import Trade
from .contracts import Cast


def check_cast(cast: Cast, settlements: list[SettlementState], trade: Trade) -> list[str]:
    broken = []
    alive = [p for p in cast.people if p.alive]
    counts = Counter(p.settlementId for p in alive)
    for s in settlements:
        if counts[s.settlementId] != cast.budget.get(s.settlementId, 0):
            broken.append(f"{s.name} has {counts[s.settlementId]} named people, budget {cast.budget.get(s.settlementId, 0)}")
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
    return broken
