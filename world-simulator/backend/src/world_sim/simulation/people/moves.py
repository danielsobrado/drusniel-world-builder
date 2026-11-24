"""
Named people moving between towns, drawn from the month's aggregate migration flows. An
idle adult follows their town's outflow with a chance that falls with caution, and takes
their household along, as the aggregate flow takes children with their adults; a household
with an elder stays, as elders do in the aggregate: everyone moves into a dwelling of the new town, and those who
worked leave their posts.
"""

import random
from collections import Counter
from typing import TYPE_CHECKING

from ...peoples.decisions import Opportunity, preferences, rank
from ...peoples.physiology import person_rules
from ..contracts import SettlementState
from .contracts import NpcHousehold, Person
from .generate import age_years, band_of
from .homes import leave, place
from .notes import note

if TYPE_CHECKING:
    from .life import Month

STAY = {"trader", "outlaw", "imprisoned"}


def moves(people: dict[str, Person], flows: dict[tuple[str, str], int], towns: dict[str, SettlementState], m: "Month",
          households: list[NpcHousehold], dwellings: list, budget: dict[str, int]) -> None:
    for (origin, destination), movers in sorted(flows.items()):
        s, d = towns[origin], towns[destination]
        idle = max(1, s.society.employment.unemployed + movers)
        room = int(budget.get(destination, 0) * (1 + m.cfg["maxOverBudget"]))
        room -= sum(person.alive and person.settlementId == destination for person in people.values())
        quota = Counter({(key, band): count for key, counts in s.vitals.emigrantsByAncestry.items()
                         for band, count in (("adult", counts.adults), ("child", counts.children))})
        for p in sorted((p for p in people.values() if p.alive and p.settlementId == origin and p.role == "unemployed"),
                        key=lambda p: p.id):
            if not people[p.id].alive or people[p.id].settlementId != origin:
                continue        # already moved with their household
            members = [x for x in people.values() if x.alive and x.householdId == p.householdId]
            if len(members) > room or any(x.role in STAY or x.settlementId != origin for x in members):
                continue
            groups = Counter((x.identity.ancestryId, band_of(age_years(x, m.day, m.cfg), person_rules(m.cfg, x.identity.ancestryId)))
                             for x in members)
            if any(band == "elder" or count > quota[(ancestry, band)] for (ancestry, band), count in groups.items()):
                continue
            weights = preferences(p.identity, p.upbringing, s.identity, m.cfg.get("cultureProfiles", {}))
            if weights:
                origin_jobs, destination_jobs = s.society.employment, d.society.employment
                local = origin_jobs.employed / max(1, origin_jobs.labourSupply)
                nearby = destination_jobs.employed / max(1, destination_jobs.labourSupply)
                friends = m.ties.of(p.id, "friend")
                moving = Opportunity("move", nearby, 0.12, {"autonomy": 0.35})
                staying = Opportunity("stay", local, 0.03, {"loyalty": 0.3, "continuity": 0.25}, min(0.2, 0.04 * len(friends)))
                if rank([moving, staying], weights, greed=p.personality.greed, caution=p.personality.caution,
                        urgency=max(0.0, 1 - s.economy.food.security))[0]["id"] == "stay":
                    continue
            rng = random.Random(f"{m.seed}:{m.day}:{p.id}:move")
            if rng.random() >= movers / idle * max(0.0, m.cfg["moveScale"] - p.personality.caution):
                continue
            quota.subtract(groups)
            room -= len(members)
            old = next(h for h in households if h.id == p.householdId)
            leave(dwellings, old)
            home = place(dwellings, d, old.id, rng)
            households[households.index(old)] = old.model_copy(update={"settlementId": destination, "homeId": home.id,
                                                                       "housing": home.type})
            parts = [{"personId": x.id, "role": "mover" if x.id == p.id else "household"} for x in members]
            rate = round(idle / max(1, s.society.employment.labourSupply), 3)
            for x in members:
                if x.role == "worker":
                    m.ties.end(x.id, m.day, {"employer"})
                update = {"settlementId": destination, "identity": x.identity.model_copy(update={"polityId": d.identity.polityId}),
                          "businessId": None, "profession": None,
                          "role": "unemployed" if x.role == "worker" else x.role, "idleMonths": 0}
                people[x.id] = note(x, m, "moved", f"Moved from {s.name} to {d.name}", emit=x.id == p.id,
                                    message=f"The {old.family} household left {s.name} for {d.name}, where work was easier to find",
                                    related={"participants": parts, "householdId": old.id, "settlementId": destination,
                                             "relatedEntities": [origin], "facts": {"from": origin, "to": destination,
                                                                                    "unemploymentBehind": rate}},
                                    **update)
