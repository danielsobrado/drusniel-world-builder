"""
Named people moving between towns, drawn from the month's aggregate migration flows. An
idle adult follows their town's outflow with a chance that falls with caution, and takes
their household along: everyone moves into a dwelling of the new town, and those who
worked leave their posts.
"""

import random
from typing import TYPE_CHECKING

from ..contracts import SettlementState
from .contracts import NpcHousehold, Person
from .homes import leave, place
from .notes import note

if TYPE_CHECKING:
    from .life import Month

STAY = {"trader", "outlaw", "imprisoned"}


def moves(people: dict[str, Person], flows: dict[tuple[str, str], int], towns: dict[str, SettlementState], m: "Month",
          households: list[NpcHousehold], dwellings: list) -> None:
    for (origin, destination), movers in sorted(flows.items()):
        s, d = towns[origin], towns[destination]
        idle = max(1, s.society.employment.unemployed + movers)
        for p in sorted((p for p in people.values() if p.alive and p.settlementId == origin and p.role == "unemployed"),
                        key=lambda p: p.id):
            if not people[p.id].alive or people[p.id].settlementId != origin:
                continue        # already moved with their household
            members = [x for x in people.values() if x.alive and x.householdId == p.householdId]
            if any(x.role in STAY or x.settlementId != origin for x in members):
                continue
            rng = random.Random(f"{m.seed}:{m.day}:{p.id}:move")
            if rng.random() >= movers / idle * max(0.0, m.cfg["moveScale"] - p.personality.caution):
                continue
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
                update = {"settlementId": destination, "businessId": None, "profession": None,
                          "role": "unemployed" if x.role == "worker" else x.role, "idleMonths": 0}
                people[x.id] = note(x, m, "moved", f"Moved from {s.name} to {d.name}", emit=x.id == p.id,
                                    message=f"The {old.family} household left {s.name} for {d.name}, where work was easier to find",
                                    related={"participants": parts, "householdId": old.id, "settlementId": destination,
                                             "relatedEntities": [origin], "facts": {"from": origin, "to": destination,
                                                                                    "unemploymentBehind": rate}},
                                    **update)
