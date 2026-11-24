"""
Family life of the named people, reconciled with the aggregate population. A named death
is one of the town's actual deaths in that age band this month; a named birth is one of
its actual births, and only to a named couple. Marriages form a new household in a
dwelling of the town's housing stock. Every event names the relatives it touches.
"""

import random
from typing import TYPE_CHECKING

from ..contracts import SettlementState
from ..economy.roads import personality
from .contracts import Cast, NpcHousehold, Person
from .generate import age_years, band_of
from .homes import leave, place
from .notes import note
from .outlook import profile_for

if TYPE_CHECKING:
    from .life import Month

BANDS = {"child": "children", "adult": "adults", "elder": "elders"}


def deaths(people: dict[str, Person], s: SettlementState, m: "Month") -> set[str]:
    """Which named people of `s` die this month: each band takes no more than the town's own deaths in that band."""
    dead: set[str] = set()
    for band, key in BANDS.items():
        toll = s.vitals.deaths.get(key, 0)
        if not toll:
            continue
        pool = sorted((p for p in people.values() if p.alive and p.settlementId == s.settlementId
                       and band_of(age_years(p, m.day, m.cfg), m.cfg) == band), key=lambda p: p.id)
        rate = toll / max(1, getattr(s.cohorts, key) + toll)
        taken = 0
        for p in pool:
            if taken >= toll:
                break
            if random.Random(f"{m.seed}:{m.day}:{p.id}:death").random() < rate * (2 if p.role == "outlaw" else 1):
                dead.add(p.id)
                taken += 1
    return dead


def bury(p: Person, m: "Month", food_shortage: bool) -> Person:
    """Records the death once, with the relatives it bereaves, and ends the person's ties."""
    ties = m.ties
    age = age_years(p, m.day, m.cfg)
    spouse = ties.spouse(p.id)
    parts = [{"personId": p.id, "role": "deceased"}]
    parts += [{"personId": spouse, "role": "widowed"}] if spouse else []
    parts += [{"personId": c, "role": "child"} for c in ties.children(p.id) if m.alive(c)]
    parts += [{"personId": x, "role": "parent"} for x in ties.parents(p.id) if m.alive(x)]
    ties.end(p.id, m.day, {"spouse", "employer", "friend", "rival", "mentor"})
    cause = "while an outlaw" if p.role == "outlaw" else "cause not recorded"
    return note(p, m, "died", f"Died at {age}", message=f"{p.name} {p.family} died at {age}",
                related={"participants": parts, "householdId": p.householdId, "facts": {"age": age, "duringFoodShortage": food_shortage}},
                alive=False, deathDay=m.day, cause=cause, businessId=None)


def _new_household(cast_households: list[NpcHousehold], dwellings: list, s: SettlementState, family: str, kind: str, hid: str,
                   rng: random.Random) -> NpcHousehold:
    home = place(dwellings, s, hid, rng)
    h = NpcHousehold(id=hid, settlementId=s.settlementId, family=family, kind=kind, housing=home.type, homeId=home.id)
    cast_households.append(h)
    return h


def marriages(people: dict[str, Person], s: SettlementState, m: "Month", households: list[NpcHousehold], dwellings: list) -> None:
    c, ties = m.cfg, m.ties
    singles = sorted((p for p in people.values() if p.alive and p.settlementId == s.settlementId
                      and c["marryFromAge"] <= age_years(p, m.day, m.cfg) <= c["marryUntilAge"]
                      and p.role not in ("outlaw", "imprisoned", "child") and ties.spouse(p.id) is None), key=lambda p: p.id)
    taken: set[str] = set()
    for p in singles:
        if p.id in taken:
            continue
        rng = random.Random(f"{m.seed}:{m.day}:{p.id}:marry")
        options = [q for q in singles if q.id not in taken and q.id != p.id and q.sex != p.sex
                   and abs(q.birthDay - p.birthDay) <= c["partnerAgeGap"] * c["daysPerYear"]]
        if not options:
            continue
        friends = [q for q in options if ties.linked(p.id, q.id, "friend")]
        if rng.random() >= c["marriagePerMonth"] * (3 if friends else 1):
            continue
        q = min(friends or options, key=lambda q: (abs(q.birthDay - p.birthDay), q.id))
        taken |= {p.id, q.id}
        m.counter += 1
        h = _new_household(households, dwellings, s, p.family, "couple", f"household:{s.sourceId}:m{m.day}-{m.counter}", rng)
        for x in (p, q):
            old = next(o for o in households if o.id == x.householdId)
            if not any(o.householdId == old.id and o.alive and o.id not in (p.id, q.id) for o in people.values()):
                leave(dwellings, old)
        rel = ties.add("spouse", p.id, q.id, m.day)
        parents = [{"personId": x, "role": "parent"} for x in {*ties.parents(p.id), *ties.parents(q.id)} if m.alive(x)]
        for x, partner in ((p, q), (q, p)):
            people[x.id] = note(x, m, "married", f"Married {partner.name} {partner.family}", emit=x is p,
                                message=f"{p.name} {p.family} and {q.name} {q.family} married in {s.name}",
                                related={"participants": [{"personId": p.id, "role": "spouse"}, {"personId": q.id, "role": "spouse"},
                                                          *parents], "householdId": h.id, "ties": [rel.id]},
                                householdId=h.id)


def births(people: dict[str, Person], s: SettlementState, m: "Month", cast: Cast, room: int, households: list[NpcHousehold]) -> int:
    """Named children of named couples, within the town's births this month and the budget's allowance; returns how many.
    `households` is the month's working list, so a couple married earlier this month is found. A child comes at least
    `pregnancyMonths` after the marriage and after the mother's previous child."""
    c, ties = m.cfg, m.ties
    carried = c.get("pregnancyMonths", 0) * c["daysPerMonth"]     # 0 in rules frozen before it existed: they replay unchanged
    families = {h.id: h.family for h in households}
    if s.vitals.births <= 0 or room <= 0:
        return 0
    rate = s.vitals.births / max(1, s.cohorts.adults / 2)
    born = 0
    mothers = sorted((p for p in people.values() if p.alive and p.sex == "female" and p.settlementId == s.settlementId
                      and c["parentMinAge"] <= age_years(p, m.day, m.cfg) <= 45 and ties.spouse(p.id)), key=lambda p: p.id)
    for mother in mothers:
        father_id = ties.spouse(mother.id)
        if born >= min(room, s.vitals.births) or not m.alive(father_id) or people[father_id].householdId != mother.householdId:
            continue
        married = ties.of(mother.id, "spouse")[0].since
        last = max((people[x].birthDay for x in ties.children(mother.id) if x in people), default=None)
        if m.day - married < carried or (last is not None and m.day - last < carried):
            continue
        rng = random.Random(f"{m.seed}:{m.day}:{mother.id}:birth")
        if rng.random() >= rate:
            continue
        father = people[father_id]
        cast_seq = m.next_id(s)
        traits = personality(rng)
        child = Person(id=cast_seq, name=rng.choice(cast.names[s.settlementId].given), family=families[mother.householdId],
            sex=rng.choice(("female", "male")), birthDay=m.day,
            settlementId=s.settlementId, birthplaceId=s.settlementId, householdId=mother.householdId, role="child",
            personality=traits, profile=profile_for(traits, rng))
        siblings = [x for x in ties.children(mother.id) if x in ties.children(father.id) and m.alive(x)]
        new_ties = [ties.add("parent", mother.id, child.id, m.day).id, ties.add("parent", father.id, child.id, m.day).id]
        new_ties += [ties.add("sibling", x, child.id, m.day).id for x in siblings]
        people[child.id] = note(child, m, "born", f"Born to {mother.name} and {father.name} {father.family}",
                                related={"participants": [{"personId": child.id, "role": "newborn"}, {"personId": mother.id,
                                                                                                      "role": "mother"},
                                                          {"personId": father.id, "role": "father"}], "householdId": mother.householdId,
                                         "ties": new_ties})
        born += 1
    return born
