"""Caravan posts held by named people: a master who died is replaced, and a new post goes to someone from the town."""

import random
from typing import TYPE_CHECKING

from ..contracts import SettlementState
from ..economy.contracts import Trade
from ..economy.roads import new_trader
from .contracts import Person
from .generate import age_years
from .notes import note

if TYPE_CHECKING:
    from .life import Month


def promote_traders(people: dict[str, Person], trade: Trade, settlements: list[SettlementState], m: "Month") -> Trade:
    traders = list(trade.traders)
    seq = trade.traderSeq
    holders: dict[str, Person] = {}
    living_holders = set()
    residents: dict[str, list[str]] = {}
    for p in people.values():
        residents.setdefault(p.settlementId, []).append(p.id)
        if p.traderId:
            holders.setdefault(p.traderId, p)
            if p.alive:
                living_holders.add(p.traderId)
    for i, t in enumerate(list(traders)):
        holder = holders.get(t.id)
        if t.active and holder is not None and not holder.alive:
            traders[i] = t.model_copy(update={"active": False, "dismissedDay": m.day})
            seq += 1
            traders.append(new_trader(f"npc:trader:{seq}", t.name, t.settlementId, t.settlementName, t.routeId,
                                      random.Random(f"{m.seed}:hire:{seq}"), m.cfg_economy, m.day))
    names = {s.settlementId: s.name for s in settlements}
    for i, t in enumerate(traders):
        if not t.active or t.id in living_holders:
            continue
        local = [people[pid] for pid in residents.get(t.settlementId, ())]
        pool = [p for p in local if p.alive and not p.journeyId
                and p.role in ("unemployed", "worker")
                and age_years(p, m.day, m.cfg) >= 18 and not any(e.kind == "dismissed" for e in p.events)]   # no second chances
        if not pool:
            continue
        pick = min(pool, key=lambda p: (p.role != "unemployed", -(p.personality.honesty + p.personality.caution), p.id))
        if pick.role == "worker":
            m.ties.end(pick.id, m.day, {"employer"}, entity=pick.businessId)
        ousted = [p for p in local if p.events and p.events[-1].kind == "dismissed"
                  and p.events[-1].day == m.day]
        ties = [m.ties.add("rival", p.id, pick.id, m.day, routeId=t.routeId).id for p in ousted]
        parts = [{"personId": pick.id, "role": "new-master"}, *({"personId": p.id, "role": "predecessor"} for p in ousted)]
        people[pick.id] = note(pick, m, "trader", f"Taken on as caravan master on the {t.settlementName} road",
                               message=f"{pick.name} {pick.family} of {names.get(t.settlementId, '')} was taken on as caravan master",
                               related={"routeId": t.routeId, "relatedEntities": [t.id], "participants": parts, "ties": ties},
                               role="trader", traderId=t.id, businessId=None, profession="caravan master", idleMonths=0)
        living_holders.add(t.id)
        traders[i] = t.model_copy(update={"name": pick.name, "personality": pick.personality})
    return trade.model_copy(update={"traders": traders, "traderSeq": seq})
