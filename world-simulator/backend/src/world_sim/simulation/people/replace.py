"""Keeping the cast whole: masters taken on from the town's own people, and the dead replaced by newborns or newcomers."""

import random
from typing import TYPE_CHECKING, Any

from ..contracts import SettlementState
from ..economy.contracts import Trade
from ..economy.roads import new_trader, personality
from .contracts import Cast, LifeEvent, NpcHousehold, Person
from .generate import age_years, birth_day

if TYPE_CHECKING:
    from .life import Month


def _event(p: Person, day: int, kind: str, text: str, cfg: dict[str, Any], **update: Any) -> Person:
    return p.model_copy(update={**update, "events": [*p.events, LifeEvent(day=day, kind=kind, text=text)][-cfg["maxEvents"]:]})


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
        people[pick.id] = _event(pick, m.day, "trader", f"Taken on as caravan master on the {t.settlementName} road", m.cfg,
                                 role="trader", traderId=t.id, businessId=None, profession="caravan master", idleMonths=0)
        traders[i] = t.model_copy(update={"name": pick.name, "personality": pick.personality})
        m.incidents.append({"kind": "hired", "message": f"{pick.name} {pick.family} of {names.get(t.settlementId, '')} was taken on "
                            "as caravan master", "person": pick.id, "trader": t.id})
    return cast.model_copy(update={"people": list(people.values())}), trade.model_copy(update={"traders": traders, "traderSeq": seq})


def replace_dead(cast: Cast, settlements: list[SettlementState], m: "Month") -> Cast:
    """Each settlement keeps its budget alive: a newborn in a family with young adults, or else a newcomer."""
    c = m.cfg
    people, households = list(cast.people), list(cast.households)
    seq, births, arrivals = dict(cast.seq), cast.births, cast.arrivals
    died = [p for p in people if p.deathDay == m.day]
    names = {s.settlementId: s.name for s in settlements}
    for p in died:
        m.incidents.append({"kind": "died", "message": f"{p.name} {p.family} of {names.get(p.settlementId, '')} "
                            f"died at {age_years(p, m.day)} ({p.cause})", "person": p.id})
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
                                householdId=home.id, role="child", personality=personality(rng),
                                events=[LifeEvent(day=m.day, kind="born", text=f"Born to {parent.name} {parent.family}")])
                births += 1
            else:
                housing = s.society.housing
                home = NpcHousehold(id=f"household:{s.sourceId}:n{seq[sid]}", settlementId=sid,
                                    family=rng.choice(pool.family) if pool else "Newcomer", kind="single",
                                    housing=rng.choices([h.type for h in housing], weights=[max(1, h.occupied) for h in housing])[0]
                                    if housing else "cottage")
                households.append(home)
                person = Person(id=pid, name=name, family=home.family, sex=rng.choice(("female", "male")),
                                birthDay=birth_day(rng, "adult", c["ages"]), settlementId=sid, householdId=home.id, role="unemployed",
                                personality=personality(rng), events=[LifeEvent(day=m.day, kind="arrived", text=f"Came to {s.name}")])
                arrivals += 1
            people.append(person)
    return cast.model_copy(update={"people": people, "households": households, "seq": seq, "births": births, "arrivals": arrivals,
                                   "deaths": cast.deaths + len(died)})


