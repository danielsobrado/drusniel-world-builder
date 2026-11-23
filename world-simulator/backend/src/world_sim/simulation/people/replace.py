"""Keeping the cast whole: masters taken on from the town's own people, and the dead replaced by newborns or newcomers."""

import random
from typing import TYPE_CHECKING

from ..contracts import SettlementState
from ..economy.contracts import Trade
from ..economy.roads import new_trader, personality
from .contracts import Cast, NpcHousehold, Person
from .generate import age_years, birth_day
from .homes import place
from .notes import note

if TYPE_CHECKING:
    from .life import Month


def promote_traders(cast: Cast, trade: Trade, settlements: list[SettlementState], m: "Month") -> tuple[Cast, Trade]:
    """Every active master is a named person: a master who died is replaced, and a new post goes to someone from the town."""
    people = {p.id: p for p in cast.people}
    traders = list(trade.traders)
    seq = trade.traderSeq
    for i, t in enumerate(list(traders)):
        holder = next((p for p in people.values() if p.traderId == t.id), None)
        if t.active and holder is not None and not holder.alive:
            traders[i] = t.model_copy(update={"active": False, "dismissedDay": m.day})
            seq += 1
            traders.append(new_trader(f"npc:trader:{seq}", t.name, t.settlementId, t.settlementName, t.routeId,
                                      random.Random(f"{m.seed}:hire:{seq}"), m.cfg_economy, m.day))
    names = {s.settlementId: s.name for s in settlements}
    for i, t in enumerate(traders):
        if not t.active or any(p.traderId == t.id and p.alive for p in people.values()):
            continue
        pool = [p for p in people.values() if p.alive and p.settlementId == t.settlementId and p.role in ("unemployed", "worker")
                and age_years(p, m.day) >= 18 and not any(e.kind == "dismissed" for e in p.events)]   # no second chances
        if not pool:
            continue
        pick = min(pool, key=lambda p: (p.role != "unemployed", -(p.personality.honesty + p.personality.caution), p.id))
        people[pick.id] = note(pick, m, "trader", f"Taken on as caravan master on the {t.settlementName} road",
                               message=f"{pick.name} {pick.family} of {names.get(t.settlementId, '')} was taken on as caravan master",
                               related={"routeId": t.routeId, "relatedEntities": [t.id]},
                               role="trader", traderId=t.id, businessId=None, profession="caravan master", idleMonths=0)
        traders[i] = t.model_copy(update={"name": pick.name, "personality": pick.personality})
    return cast.model_copy(update={"people": list(people.values())}), trade.model_copy(update={"traders": traders, "traderSeq": seq})


def replace_dead(cast: Cast, settlements: list[SettlementState], m: "Month") -> Cast:
    """Each settlement keeps its budget alive: a newborn in a family with young adults, or else a newcomer."""
    c = m.cfg
    people, households, dwellings = list(cast.people), list(cast.households), list(cast.dwellings)
    seq, births, arrivals = dict(cast.seq), cast.births, cast.arrivals
    died = [p for p in people if p.deathDay == m.day]
    for s in settlements:
        sid = s.settlementId
        missing = cast.budget.get(sid, 0) - sum(1 for p in people if p.alive and p.settlementId == sid)
        pool = cast.names[sid] if sid in cast.names else None
        for k in range(max(0, missing)):
            rng = random.Random(f"{m.seed}:{m.day}:{sid}:new:{k}")
            seq[sid] = seq.get(sid, 0) + 1
            pid = f"npc:{s.sourceId}:{seq[sid]}"
            name = rng.choice(pool.given) if pool else f"Person {seq[sid]}"
            parents = [p for p in people if p.alive and p.settlementId == sid and 18 <= age_years(p, m.day) <= 45]
            if parents and rng.random() < c["newbornShare"]:
                parent = rng.choice(parents)
                home = next(h for h in households if h.id == parent.householdId)
                person = Person(id=pid, name=name, family=home.family, sex=rng.choice(("female", "male")), birthDay=m.day, settlementId=sid,
                                householdId=home.id, role="child", personality=personality(rng))
                person = note(person, m, "born", f"Born to {parent.name} {parent.family}",
                              related={"householdId": home.id, "participants": [{"personId": pid, "role": "newborn"},
                                                                                {"personId": parent.id, "role": "parent"}]})
                births += 1
            else:
                hid = f"household:{s.sourceId}:n{seq[sid]}"
                dwelling = place(dwellings, s, hid, rng)
                home = NpcHousehold(id=hid, settlementId=sid, family=rng.choice(pool.family) if pool else "Newcomer", kind="single",
                                    housing=dwelling.type, homeId=dwelling.id)
                households.append(home)
                person = Person(id=pid, name=name, family=home.family, sex=rng.choice(("female", "male")),
                                birthDay=birth_day(rng, "adult", c["ages"]), settlementId=sid, householdId=home.id, role="unemployed",
                                personality=personality(rng))
                person = note(person, m, "moved", f"Came to {s.name}", related={"householdId": home.id})
                arrivals += 1
            people.append(person)
    return cast.model_copy(update={"people": people, "households": households, "dwellings": dwellings, "seq": seq,
                                   "births": births, "arrivals": arrivals,
                                   "deaths": cast.deaths + len(died)})


