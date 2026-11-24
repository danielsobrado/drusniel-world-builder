"""Embark and settle the named households represented by aggregate migration."""

import random
from collections import Counter

from ...peoples.decisions import Opportunity, preferences, rank
from ...peoples.physiology import person_rules
from ..contracts import Journey, SettlementState
from .contracts import Cast
from .generate import age_years, band_of
from .homes import leave, place
from .relationships import Ties

STAY = {"trader", "outlaw", "imprisoned"}


def embark(cast: Cast, journey: Journey, origin: SettlementState, destination: SettlementState, *, seed: int,
           cfg: dict, reserved: int, distance_days: int, risk: float, booked: set[str] | None = None) -> tuple[Cast, list[str]]:
    people = {p.id: p for p in cast.people}
    ties = Ties(cast.relationships, cast.relSeq)
    households = {h.id: h for h in cast.households}
    dwellings = list(cast.dwellings)
    room = int(cast.budget.get(destination.settlementId, 0) * (1 + cfg["maxOverBudget"])) - reserved
    room -= sum(p.alive and p.settlementId == destination.settlementId for p in people.values())
    quota = Counter({(key, band): count for key, counts in journey.ancestries.items()
                     for band, count in (("adult", counts.adults), ("child", counts.children))})
    groups = {}
    for p in people.values():
        if p.alive and not p.journeyId and p.settlementId == origin.settlementId:
            groups.setdefault(p.householdId, []).append(p)
    chosen = []
    remaining_slots = journey.householdSlots
    for hid, members in sorted(groups.items()):
        if len(members) > room or not remaining_slots or any(p.role in STAY or (booked and p.id in booked) for p in members):
            continue
        idle = [p for p in members if p.role == "unemployed"]
        if not idle:
            continue
        bands = Counter((p.identity.ancestryId, band_of(age_years(p, journey.departDay, cfg), person_rules(cfg, p.identity.ancestryId)))
                        for p in members)
        if any(n > quota[key] for key, n in bands.items()):
            continue
        p = min(idle, key=lambda item: (item.personality.caution, item.id))
        weights = preferences(p.identity, p.upbringing, destination.identity, cfg.get("cultureProfiles", {}))
        local_friends = min(0.2, 0.04 * len(ties.of(p.id, "friend")))
        jobs = destination.society.employment
        employment = jobs.employed / max(1, jobs.labourSupply)
        move = Opportunity("move", employment, min(0.8, risk + distance_days / 100), {"autonomy": 0.3})
        stay = Opportunity("stay", 0.62, 0.1, {"loyalty": 0.25, "continuity": 0.25}, local_friends)
        urgency = max(0.0, 1 - origin.economy.food.security)
        if rank([move, stay], weights, greed=p.personality.greed, caution=p.personality.caution, urgency=urgency)[0]["id"] == "stay":
            continue
        odds = journey.population / max(1, origin.society.employment.unemployed)
        if random.Random(f"{seed}:{journey.id}:{p.id}:embark").random() >= odds * max(0.0, cfg["moveScale"] - p.personality.caution):
            continue
        quota.subtract(bands)
        room -= len(members)
        remaining_slots -= 1
        house = households[hid]
        leave(dwellings, house)
        households[hid] = house.model_copy(update={"homeId": None})
        for member in members:
            if member.role == "worker":
                ties.end(member.id, journey.departDay, {"employer"}, entity=member.businessId)
            people[member.id] = member.model_copy(update={"journeyId": journey.id, "businessId": None, "profession": None,
                "role": "unemployed" if member.role == "worker" else member.role, "idleMonths": 0})
            chosen.append(member.id)
    return cast.model_copy(update={"people": list(people.values()), "households": list(households.values()), "dwellings": dwellings,
                                   "relationships": ties.items}), chosen


def settle(cast: Cast, journey: Journey, destination: SettlementState, seed: int) -> Cast:
    """Release travel status and rehouse the named residents when they actually arrive."""
    if not journey.personIds:
        return cast
    party = set(journey.personIds)
    dwellings = list(cast.dwellings)
    movers = [p for p in cast.people if p.id in party]
    moved_households = {p.householdId for p in movers}
    households = []
    rng = random.Random(f"{seed}:{journey.id}:home")
    named_vacancy = sum(h.capacity for h in destination.society.housing) - sum(
        len(d.households) for d in dwellings if d.settlementId == destination.settlementId)
    for house in cast.households:
        if house.id in moved_households:
            home = place(dwellings, destination, house.id, rng) if named_vacancy > 0 else None
            named_vacancy -= 1
            house = house.model_copy(update={"settlementId": destination.settlementId, "homeId": home.id if home else None,
                                             "housing": home.type if home else house.housing})
        households.append(house)
    people = [p.model_copy(update={"journeyId": None, "settlementId": destination.settlementId,
                                   "visited": {**p.visited, destination.settlementId: journey.arriveDay},
                                   "identity": p.identity.model_copy(update={"polityId": destination.identity.polityId})})
              if p.id in party else p for p in cast.people]
    return cast.model_copy(update={"people": people, "households": households, "dwellings": dwellings})
