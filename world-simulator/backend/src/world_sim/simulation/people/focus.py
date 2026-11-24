"""
Filling a vacancy in the cast: an inhabitant already counted in the town's population
comes into focus as a named person. Nobody is invented or brought in from outside; the
person existed in the aggregate all along, and gets a household and a dwelling of the
town's housing stock, and a role from the town's own job market.
"""

import random
from typing import TYPE_CHECKING

from ..contracts import SettlementState
from ..economy.roads import personality
from .contracts import Cast, NpcHousehold, Person
from .generate import birth_day
from .homes import place
from .notes import note
from .outlook import profile_for

if TYPE_CHECKING:
    from .life import Month


def promote(people: dict[str, Person], s: SettlementState, cast: Cast, m: "Month", households: list[NpcHousehold], dwellings: list,
            named_workers: dict[str, int]) -> Person:
    rng = random.Random(f"{m.seed}:{m.day}:{s.settlementId}:focus:{m.counter}")
    m.counter += 1
    band = "elder" if rng.random() < s.cohorts.elders / max(1, s.cohorts.adults + s.cohorts.elders) else "adult"
    pid = m.next_id(s)
    pool = cast.names[s.settlementId]
    family = rng.choice(pool.family)
    hid = f"household:{s.sourceId}:f{m.day}-{m.counter}"
    home = place(dwellings, s, hid, rng)
    households.append(NpcHousehold(id=hid, settlementId=s.settlementId, family=family, kind="single", housing=home.type, homeId=home.id))
    traits = personality(rng)
    e = s.society.employment
    posts = [b for b in s.society.businesses if b.filled > named_workers.get(b.id, 0)]
    works = posts and rng.random() < (e.employed / e.labourSupply if e.labourSupply else 0) * (1 if band == "adult" else 0.25)
    role, business = ("worker", rng.choices(posts, weights=[b.filled - named_workers.get(b.id, 0) for b in posts])[0]) if works else \
        ("retired" if band == "elder" else "unemployed", None)
    if business:
        named_workers[business.id] = named_workers.get(business.id, 0) + 1
    person = Person(id=pid, name=rng.choice(pool.given), family=family, sex=rng.choice(("female", "male")),
                    birthDay=birth_day(rng, band, m.cfg), settlementId=s.settlementId, householdId=hid, role=role,
                    businessId=business.id if business else None, profession=business.profession if business else None,
                    retired=role == "retired", personality=traits, profile=profile_for(traits, rng))
    if business:
        m.ties.add("employer", business.id, pid, m.day)
    person = note(person, m, "promoted", f"Came into focus as one of {s.name}'s people",
                  related={"source": "inferred", "householdId": hid, "facts": {"band": band}})
    people[pid] = person
    return person
