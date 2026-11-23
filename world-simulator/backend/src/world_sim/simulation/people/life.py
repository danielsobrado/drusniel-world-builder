"""
A month in the lives of the named people, in order: deaths drawn from the town's actual
deaths; ageing, work, outlawry and prison; marriages; births drawn from the town's
actual births; moves with the migration flows; friendships at work; caravan posts; and
vacancies filled by inhabitants coming into focus.
"""

import random
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from ..contracts import Business, SettlementState
from ..economy.contracts import Route, Trade, Trader
from .contracts import Cast, Person
from .family import births, bury, deaths, marriages
from .focus import promote
from .generate import age_years
from .homes import leave
from .moves import moves
from .notes import note
from .relationships import Ties
from .replace import promote_traders


@dataclass
class Town:
    """What a person's life this month depends on in their settlement."""
    settlement: SettlementState
    businesses: dict[str, Business]
    named: Counter
    route: Route | None
    outlaws: int
    unemployment: float


@dataclass
class Month:
    day: int
    seed: int
    cfg: dict[str, Any]
    cfg_economy: dict[str, Any]
    traders: dict[str, Trader]
    recent: int
    ties: Ties
    seq: dict[str, int]
    people: dict[str, Person] = field(default_factory=dict)
    incidents: list[dict[str, Any]] = field(default_factory=list)
    counter: int = 0

    def alive(self, pid: str | None) -> bool:
        p = self.people.get(pid or "")
        return bool(p and p.alive)

    def next_id(self, s: SettlementState) -> str:
        self.seq[s.settlementId] = self.seq.get(s.settlementId, 0) + 1
        return f"npc:{s.sourceId}:{self.seq[s.settlementId]}"


def _towns(people: dict[str, Person], settlements: list[SettlementState], routes: list[Route]) -> dict[str, Town]:
    towns = {}
    for s in settlements:
        e = s.society.employment
        named = Counter(p.businessId for p in people.values() if p.alive and p.settlementId == s.settlementId and p.role == "worker")
        route = next((r for r in routes if r.settlementId == s.settlementId), None)
        outlaws = sum(1 for p in people.values() if p.alive and p.role == "outlaw" and route and p.routeId == route.id)
        towns[s.settlementId] = Town(s, {b.id: b for b in s.society.businesses}, named, route, outlaws,
                                     e.unemployed / e.labourSupply if e.labourSupply else 0.0)
    return towns


def _hire(p: Person, b: Business, town: Town, m: Month) -> Person:
    town.named[b.id] += 1
    rel = m.ties.add("employer", b.id, p.id, m.day)
    p = note(p, m, "hired", f"Hired as {b.profession} at {b.name}", related={"businessId": b.id, "ties": [rel.id],
             "facts": {"profession": b.profession, "monthsIdle": p.idleMonths}}, role="worker", businessId=b.id, profession=b.profession,
             idleMonths=0)
    if age_years(p, m.day) <= m.cfg["apprenticeUntilAge"]:
        mentor = next((x for x in sorted(m.people.values(), key=lambda x: x.birthDay) if x.alive and x.businessId == b.id
                       and x.profession == b.profession and age_years(x, m.day) >= 30), None)
        if mentor:
            tie = m.ties.add("mentor", mentor.id, p.id, m.day, businessId=b.id)
            m.incidents.append({"kind": "apprenticeship-started", "message": f"{p.name} {p.family} began learning the {b.profession}'s "
                                f"trade under {mentor.name} {mentor.family}", "settlementId": p.settlementId, "businessId": b.id,
                                "participants": [{"personId": p.id, "role": "apprentice"}, {"personId": mentor.id, "role": "mentor"}],
                                "ties": [tie.id]})
    return p


def _lose(p: Person, m: Month, text: str, related: dict[str, Any]) -> Person:
    m.ties.end(p.id, m.day, {"employer"}, entity=p.businessId)
    return note(p, m, "lost-work", text, related=related, role="unemployed", businessId=None, profession=None, idleMonths=0)


def _work(p: Person, town: Town, m: Month, rng: random.Random) -> Person:
    c = m.cfg
    if p.role == "worker":
        business = town.businesses.get(p.businessId or "")
        if business is None or town.named[p.businessId] > business.filled:
            town.named[p.businessId] -= 1
            what = f"{business.name} let workers go" if business else "their workplace closed"
            return _lose(p, m, f"Lost work: {what}", {"businessId": p.businessId, "facts": {"closed": business is None}})
        if rng.random() < c["loseWorkPerMonth"] * town.unemployment:
            town.named[p.businessId] -= 1
            return _lose(p, m, f"Let go by {business.name}", {"businessId": p.businessId})
        return p
    if p.role != "unemployed":
        return p
    p = p.model_copy(update={"idleMonths": p.idleMonths + 1})
    if rng.random() < c["findWorkPerMonth"] * (1 - town.unemployment) * (0.75 + 0.5 * p.personality.caution):
        posts = [b for b in town.businesses.values() if b.filled > town.named[b.id]]
        if posts:
            return _hire(p, rng.choices(posts, weights=[x.filled - town.named[x.id] for x in posts])[0], town, m)
    o, t = c["outlaw"], p.personality
    if (town.route and p.idleMonths >= o["idleMonths"] and t.honesty <= o["maxHonesty"] and t.greed >= o["minGreed"]
            and rng.random() < o["chance"]):
        town.outlaws += 1
        way = "sea lane" if town.route.mode == "sea" else "road"
        band = "pirates" if way == "sea lane" else "bandits"
        return note(p, m, "outlaw", f"Took to the {way} with the {band}",
                    message=f"{p.name} {p.family} of {town.settlement.name} took to the {way} to {town.route.centerName} after "
                            f"{p.idleMonths} months without work",
                    related={"routeId": town.route.id, "facts": {"monthsIdle": p.idleMonths}}, role="outlaw", routeId=town.route.id)
    return p


def _outlaw(p: Person, town: Town, m: Month, rng: random.Random) -> Person:
    c, route = m.cfg, town.route
    if route is None or route.id != p.routeId or route.bandits < town.outlaws:
        town.outlaws -= 1
        return note(p, m, "came-home", "Came home when the band broke up", related={"routeId": p.routeId}, role="unemployed",
                    routeId=None, idleMonths=0)
    if rng.random() < route.removed / max(1, route.bandits + route.removed):
        town.outlaws -= 1
        return note(p, m, "caught", "Caught by a patrol and imprisoned",
                    message=f"{p.name} {p.family}, outlaw on the {town.settlement.name} road, was caught and imprisoned",
                    related={"routeId": route.id, "facts": {"prisonDays": c["prisonDays"]}}, role="imprisoned", routeId=None,
                    releaseDay=m.day + c["prisonDays"])
    if rng.random() < c["outlaw"]["giveUpPerMonth"]:
        town.outlaws -= 1
        return note(p, m, "came-home", "Gave up the outlaw's life and came home", related={"routeId": p.routeId}, role="unemployed",
                    routeId=None, idleMonths=0)
    return p


def _live(p: Person, town: Town, m: Month) -> Person:
    c = m.cfg
    rng = random.Random(f"{m.seed}:{m.day}:{p.id}")
    age = age_years(p, m.day)
    if p.role == "imprisoned" and m.day >= (p.releaseDay or 0):
        return note(p, m, "released", "Released from prison", role="unemployed", releaseDay=None, idleMonths=0)
    if p.role == "child" and age >= c["ages"]["adult"][0]:
        return note(p, m, "came-of-age", f"Came of age at {age}", role="unemployed", idleMonths=0)
    if p.role == "worker" and age >= c["retireFrom"] and not p.retired:
        if rng.random() < c["retireChance"] * (1 - 0.5 * p.personality.greed):
            town.named[p.businessId] -= 1
            m.ties.end(p.id, m.day, {"employer"}, entity=p.businessId)
            return note(p, m, "retired", f"Retired from {p.profession} work at {age}", related={"businessId": p.businessId},
                        role="retired", retired=True, businessId=None, profession=None)
        p = p.model_copy(update={"retired": True})
    if p.role == "trader" and p.traderId and not m.traders[p.traderId].active:
        # The economy already recorded the dismissal as an event; the person's cache just notes it.
        return note(p, m, "dismissed", "Let go as caravan master", emit=False, role="unemployed", traderId=None, profession=None,
                    idleMonths=0)
    if p.role == "outlaw":
        return _outlaw(p, town, m, rng)
    return _work(p, town, m, rng)


def _friendships(m: Month) -> None:
    by_business: dict[str, list[Person]] = {}
    for p in m.people.values():
        if p.alive and p.role == "worker" and p.businessId:
            by_business.setdefault(p.businessId, []).append(p)
    for business, staff in sorted(by_business.items()):
        staff.sort(key=lambda p: p.id)
        for i, a in enumerate(staff):
            for b in staff[i + 1:]:
                if m.ties.linked(a.id, b.id, "friend") or len(m.ties.of(a.id, "friend")) >= 3 or len(m.ties.of(b.id, "friend")) >= 3:
                    continue
                since = [r.since for r in m.ties.items if r.kind == "employer" and r.active and r.b in (a.id, b.id)]
                if len(since) < 2 or m.day - max(since) < 360:
                    continue
                if random.Random(f"{m.seed}:{m.day}:{a.id}:{b.id}:friend").random() < m.cfg["friendshipPerMonth"]:
                    rel = m.ties.add("friend", a.id, b.id, m.day, businessId=business)
                    m.incidents.append({"kind": "friendship",
                                        "message": f"{a.name} {a.family} and {b.name} {b.family} became friends at work",
                                        "settlementId": a.settlementId, "businessId": business, "ties": [rel.id],
                                        "participants": [{"personId": a.id, "role": "friend"}, {"personId": b.id, "role": "friend"}]})


def people_month(cast: Cast, settlements: list[SettlementState], trade: Trade, flows: dict[tuple[str, str], int], *, day: int, seed: int,
                 rules: dict[str, Any]) -> tuple[Cast, Trade, list[dict[str, Any]]]:
    c = rules["simulation"]["people"]
    m = Month(day, seed, c, rules["economy"], {t.id: t for t in trade.traders}, rules["simulation"]["history"]["recentEvents"],
              Ties(cast.relationships, cast.relSeq), dict(cast.seq))
    people = m.people = {p.id: p for p in cast.people}
    households, dwellings = list(cast.households), list(cast.dwellings)
    by_id = {s.settlementId: s for s in settlements}
    died = 0
    for s in settlements:
        shortage = s.economy.food.security < 1
        for pid in sorted(deaths(people, s, m)):
            people[pid] = bury(people[pid], m, shortage)
            died += 1
    towns = _towns(people, settlements, trade.routes)
    for pid in [p.id for p in people.values() if p.alive and p.settlementId in towns]:
        people[pid] = _live(people[pid], towns[people[pid].settlementId], m)
    born = 0
    for s in settlements:
        marriages(people, s, m, households, dwellings)
        alive = sum(1 for p in people.values() if p.alive and p.settlementId == s.settlementId)
        room = int(cast.budget.get(s.settlementId, 0) * (1 + c["maxOverBudget"])) - alive
        born += births(people, s, m, cast, room)
    moves(people, flows, by_id, m, households, dwellings)
    _friendships(m)
    trade = promote_traders(people, trade, settlements, m)
    focused = 0
    named = Counter(p.businessId for p in people.values() if p.alive and p.role == "worker")
    for s in settlements:
        while sum(1 for p in people.values() if p.alive and p.settlementId == s.settlementId) < cast.budget.get(s.settlementId, 0):
            promote(people, s, cast, m, households, dwellings, named)
            focused += 1
    occupied = {p.householdId for p in people.values() if p.alive}
    for h in households:
        if h.homeId and h.id not in occupied:
            leave(dwellings, h)
    households = [h.model_copy(update={"homeId": None}) if h.homeId and h.id not in occupied else h for h in households]
    cast = cast.model_copy(update={
        "people": list(people.values()), "households": households, "dwellings": dwellings, "seq": m.seq,
        "relationships": m.ties.items, "relSeq": m.ties.seq, "deaths": cast.deaths + died, "births": cast.births + born,
        "arrivals": cast.arrivals + focused})
    return cast, trade, m.incidents
