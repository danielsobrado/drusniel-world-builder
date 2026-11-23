"""
A reconstructed past for everyone who enters the record already grown: the people at a
scenario's start, and inhabitants who come into focus later. Every fact is built from
what the record already holds (birth date and place, household, the employer, spouse,
mentor and parent ties, the current role) and labelled `generated-prehistory` with year
or approximate precision; nothing is placed after the person entered the record or
before they were born. Ties reconstructed at the start point at the event that now
explains them.
"""

import random
from typing import Any

from ..history.contracts import HistoryEvent
from ..history.recorder import on_timelines, record, with_origins
from .contracts import Cast, Person
from .relationships import Ties

YEAR = 360


def _year(rng: random.Random, low: int, high: int) -> int:
    return rng.randint(low, high) if high >= low else low


class Past:
    """Builds one person's reconstructed facts as incidents (recorded in one batch by `with_backstory`)."""

    def __init__(self, p: Person, cast: Cast, ties: Ties, names: dict[str, str], businesses: dict[str, Any], now: int,
                 cfg: dict[str, Any], seed: int, done: set[str]):
        self.p, self.cast, self.ties, self.names, self.businesses = p, cast, ties, names, businesses
        self.now, self.cfg, self.done = now, cfg, done
        self.rng = random.Random(f"{seed}:backstory:{p.id}")
        self.out: list[dict[str, Any]] = []
        self.who = f"{p.name} {p.family}"
        self.home = p.birthplaceId or p.settlementId
        self.scope = {b.settlementId for b in businesses.values()} | {p.settlementId}

    def add(self, kind: str, day: int, summary: str, precision: str = "approximate", **fields: Any) -> None:
        day = max(self.p.birthDay, min(day, self.now))
        self.out.append({"kind": kind, "day": day, "message": summary, "precision": precision, "source": "generated-prehistory",
                         "participants": fields.pop("participants", None) or [{"personId": self.p.id, "role": "subject"}], **fields})

    def born(self) -> None:
        parents = self.ties.parents(self.p.id)
        roles = [{"personId": x, "role": "mother" if self.person(x).sex == "female" else "father"} for x in parents]
        place = self.names.get(self.home, "an unrecorded place")
        self.add("born", self.p.birthDay, f"{self.who} was born in {place}", "year",
                 settlementId=self.home if self.home in self.scope else None,
                 locationId=self.home, participants=[{"personId": self.p.id, "role": "newborn"}, *roles],
                 ties=[r.id for r in self.ties.items if r.kind == "parent" and r.b == self.p.id and r.origin == "generated"])
        if self.age() < 25:
            h = next((h for h in self.cast.households if h.id == self.p.householdId), None)
            kind = (h.kind if h else "single").replace("-", " ")
            self.add("upbringing", self.p.birthDay + 5 * YEAR, f"{self.who} grew up in a {kind} household in {place}",
                     facts={"household": kind}, householdId=self.p.householdId)

    def person(self, pid: str) -> Person:
        return next(x for x in self.cast.people if x.id == pid)

    def age(self) -> int:
        return (self.now - self.p.birthDay) // YEAR

    def first_steps(self) -> int:
        """Apprenticeship and the move to town, in an order that fits; returns the earliest day of working life here."""
        c = self.cfg
        job = next((r for r in self.ties.of(self.p.id, "employer") if r.b == self.p.id), None)
        spouse = next(iter(self.ties.of(self.p.id, "spouse", active=False)), None)
        kids = [self.person(x).birthDay for x in self.ties.children(self.p.id)]
        anchors = [d for d in (job.since if job else None, spouse.since if spouse else None, *kids) if d is not None]
        settled = min(anchors, default=self.now)
        trade = self.p.profession if self.p.role == "worker" else "caravan" if self.p.role == "trader" else None
        if trade and (trade in c["apprenticeTrades"] or self.p.role == "trader"):
            start = self.p.birthDay + _year(self.rng, c["apprenticeFromAge"], c["apprenticeFromAge"] + 2) * YEAR
            mentor = next((r for r in self.ties.of(self.p.id, "mentor") if r.b == self.p.id), None)
            if mentor:
                start = mentor.since
            if start < self.now:
                master = [{"personId": mentor.a, "role": "mentor"}] if mentor else []
                learned = f"was apprenticed as a {trade}" if trade != "caravan" else "was apprenticed to a caravan master"
                self.add("apprenticeship-started", start, f"{self.who} {learned}",
                         participants=[{"personId": self.p.id, "role": "apprentice"}, *master], facts={"trade": trade},
                         ties=[mentor.id] if mentor else [])
                if start + c["apprenticeYears"] * YEAR < self.now:
                    self.add("apprenticeship-completed", start + c["apprenticeYears"] * YEAR, f"{self.who} finished their apprenticeship",
                             participants=[{"personId": self.p.id, "role": "apprentice"}, *master], facts={"trade": trade})
        if self.p.birthplaceId and self.p.birthplaceId != self.p.settlementId:
            low = self.p.birthDay + c["moveAge"][0] * YEAR
            high = min(self.p.birthDay + c["moveAge"][1] * YEAR, settled - 30)
            with_family = high < low
            day = self.p.birthDay + _year(self.rng, 2, 12) * YEAR if with_family else self.rng.randint(low, high)
            day = min(day, settled - 30)
            here = self.names.get(self.p.settlementId, "town")
            self.add("moved", day, f"{self.who} {'moved with their family' if with_family else 'moved'} from "
                     f"{self.names.get(self.p.birthplaceId, 'elsewhere')} to {here}", settlementId=self.p.settlementId,
                     relatedEntities=[self.p.birthplaceId], facts={"from": self.p.birthplaceId, "to": self.p.settlementId,
                                                                   "withFamily": with_family})
        return settled

    def working_life(self) -> None:
        job = next((r for r in self.ties.of(self.p.id, "employer") if r.b == self.p.id and r.origin == "generated"), None)
        if job and job.a in self.businesses:
            b = self.businesses[job.a]
            self.add("hired", job.since, f"{self.who} began working as {b.profession} at {b.name}", "year", businessId=b.id,
                     settlementId=self.p.settlementId, ties=[job.id], facts={"profession": b.profession})
        if self.p.role == "trader":
            since = max(self.p.birthDay + 22 * YEAR, self.now - _year(self.rng, 1, 10) * YEAR)
            self.add("trader", since, f"{self.who} became a caravan master of {self.names.get(self.p.settlementId, 'their town')}",
                     settlementId=self.p.settlementId, relatedEntities=[self.p.traderId] if self.p.traderId else [])
        if self.p.role == "retired" and self.age() >= 60:
            self.add("retired", self.p.birthDay + _year(self.rng, 60, self.age()) * YEAR, f"{self.who} stopped working",
                     settlementId=self.p.settlementId)

    def family(self) -> None:
        for r in self.ties.of(self.p.id, "spouse", active=False):
            if r.origin != "generated" or r.id in self.done:
                continue
            self.done.add(r.id)
            other = self.person(self.ties.other(r, self.p.id))
            self.add("married", r.since, f"{self.who} married {other.name} {other.family}", "year", settlementId=self.p.settlementId,
                     participants=[{"personId": self.p.id, "role": "spouse"}, {"personId": other.id, "role": "spouse"}], ties=[r.id])
        c = self.cfg
        if self.age() >= c["lostParentFromAge"] and not self.ties.parents(self.p.id) and self.rng.random() < self.age() / 100:
            relation = self.rng.choice(("mother", "father"))
            self.add("lost-parent", self.p.birthDay + _year(self.rng, 20, self.age()) * YEAR, f"{self.who} lost their {relation}",
                     participants=[{"personId": self.p.id, "role": "child"}], facts={"relation": relation})


def with_backstory(cast: Cast, seq: int, now: int, settlements: list[Any], rules: dict[str, Any], seed: int) -> tuple[Cast,
                                                                                                                      list[HistoryEvent]]:
    """Reconstructs the past of everyone who lacks one; returns the cast and the recorded events (numbered from `seq`)."""
    cfg, history = rules["simulation"]["people"], rules["simulation"]["history"]
    names = {**cast.places, **{s.settlementId: s.name for s in settlements}}
    businesses = {b.id: b for s in settlements for b in s.society.businesses}
    ties = Ties(cast.relationships, cast.relSeq)
    incidents: list[dict[str, Any]] = []
    done: set[str] = set()
    people = []
    for p in cast.people:
        if p.backstory or not p.alive:
            people.append(p)
            continue
        if p.birthDay >= 0 or p.birthDay >= now - 30:
            people.append(p.model_copy(update={"backstory": True}))     # born on the record: no past to reconstruct
            continue
        past = Past(p, cast, ties, names, businesses, now, cfg, seed, done)
        past.born()
        past.first_steps()
        past.working_life()
        past.family()
        incidents += sorted(past.out, key=lambda i: i["day"])
        people.append(p.model_copy(update={"backstory": True}))
    events = [record(i, seq + n, i["day"], history) for n, i in enumerate(incidents)]
    cast = cast.model_copy(update={"people": people})
    cast = on_timelines(cast, events, history["timelineMinImportance"])
    return with_origins(cast, incidents, events), events
