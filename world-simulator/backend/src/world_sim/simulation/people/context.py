"""
The biography context of one person: every fact a later narration may use, and only
those. Facts come from the record (canonical events, relationships, state); reconstructed
pasts are marked as such; derived topics are marked derived. The restrictions travel
with the context so a model cannot invent spouses, children, businesses or journeys.
"""

from collections.abc import Callable
from typing import Any

from ..history.archive import HistoryArchive
from ..history.contracts import HistoryEvent
from .generate import age_years
from .hooks import hooks, outlook
from .relationships import Ties

RESTRICTIONS = [
    "Use only the facts listed here; do not invent relatives, marriages, children, businesses, wars, magic or journeys.",
    "Facts with source generated-prehistory are a plausible reconstruction: state them without inventing more detail.",
    "Respect date precision: give a year or 'around' a year when the precision is year or approximate, never an exact day.",
    "A death has no known cause unless one is listed; a time of food shortage is not a cause.",
    "Hooks, fears, ambitions and mood are derived from circumstances; express them, do not turn them into new events.",
]


def tier(p: Any, cfg: dict[str, Any]) -> str:
    if p.traderId or len(p.timeline) >= cfg["majorFromTimeline"]:
        return "major"
    return "basic" if p.role == "child" or len(p.timeline) < 3 else "standard"


def _event(e: HistoryEvent, pid: str, label: Callable[[int], str]) -> dict[str, Any]:
    role = next((x.role for x in e.participants if x.personId == pid), None)
    return {"id": e.id, "day": e.day, "date": label(e.day), "precision": e.datePrecision, "kind": e.kind, "category": e.category,
            "summary": e.summary, "source": e.source, "importance": e.importance, "role": role, "causedBy": e.causedBy}


class ContextBuilder:
    def __init__(self, state: Any, archive: HistoryArchive, rules: dict[str, Any], world: dict[str, dict[str, Any]],
                 label: Callable[[int], str]):
        self.state, self.archive, self.world, self.label = state, archive, world, label
        self.cfg = rules["simulation"]["people"]["biography"]
        self.people_cfg = rules["simulation"]["people"]
        self.people = {p.id: p for p in state.cast.people}
        self.ties = Ties(state.cast.relationships, state.cast.relSeq)

    def place(self, sid: str) -> str:
        return (self.world.get(sid) or {}).get("name") or self.state.cast.places.get(sid) or sid

    def relationships(self, pid: str) -> list[dict[str, Any]]:
        out = []
        for r in sorted(self.ties.of(pid, active=False), key=lambda r: r.since):
            other = self.ties.other(r, pid)
            person = self.people.get(other)
            out.append({"kind": r.kind, "direction": "from" if r.a == pid else "to", "with": other,
                        "name": f"{person.name} {person.family}" if person else other, "alive": bool(person and person.alive),
                        "since": self.label(r.since), "until": self.label(r.until) if r.until is not None else None,
                        "trust": r.trust, "origin": r.origin})
        return out

    def build(self, pid: str) -> dict[str, Any]:
        state, p = self.state, self.people[pid]
        cast = state.cast
        town = next(s for s in state.settlements if s.settlementId == p.settlementId)
        level = tier(p, self.cfg)
        target = self.cfg["tiers"][level]
        household = next((h for h in cast.households if h.id == p.householdId), None)
        mine = self.archive.query(person=pid, limit=None)
        milestones = sorted(mine, key=lambda e: (-e.importance, e.day))[: target["milestones"][1]]
        lived_from = min((e.day for e in mine if e.kind in ("moved", "promoted") and e.settlementId == p.settlementId), default=p.birthDay)
        town_history = [e for e in self.archive.query(entity=p.settlementId, min_importance=4, from_day=max(lived_from, 0),
                                                      newest_first=True, limit=40)
                        if e.visibility in ("settlement", "public") and pid not in {x.personId for x in e.participants}]
        trader = next((t for t in state.trade.traders if t.id == p.traderId), None)
        hooks_now = hooks(p, cast, state.trade, town, state.date.day, self.people_cfg)
        learned = self.archive.many([k.eventId for k in p.knowledge][-10:])
        sources = {k.eventId: k for k in p.knowledge}
        places = {x for x in (p.birthplaceId, p.settlementId) if x}
        places |= {e.facts.get("from") for e in mine if e.kind == "moved" and isinstance(e.facts.get("from"), str)}
        roads = [r.centerName for r in state.trade.routes if trader and r.id == trader.routeId]
        employment = town.society.employment
        return {
            "personId": pid, "tier": level, "targets": target, "asOf": state.date.label,
            "identity": {"name": f"{p.name} {p.family}", "sex": p.sex,
                         "age": age_years(p, state.date.day, self.people_cfg) if p.alive else None,
                         "born": self.label(p.birthDay), "birthplace": self.place(p.birthplaceId or p.settlementId),
                         "culture": (self.world.get(p.settlementId) or {}).get("cultureName"), "home": town.name, "alive": p.alive,
                         "died": self.label(p.deathDay) if p.deathDay is not None else None},
            "household": {"family": household.family, "kind": household.kind, "housing": household.housing, "homeId": household.homeId,
                          "members": [f"{x.name} {x.family}" for x in self.people.values()
                                      if x.householdId == p.householdId and x.id != pid and x.alive]} if household else None,
            "relationships": self.relationships(pid),
            "work": {"role": p.role, "profession": p.profession,
                     "workplace": next((b.name for b in town.society.businesses if b.id == p.businessId), None),
                     "caravanMaster": {"reputation": trader.scorecard.reputation, "trips": trader.scorecard.trips, "purse": trader.purse,
                                       "owns": len(trader.owns)} if trader else None},
            "circumstances": {"townUnemployment": round(employment.unemployed / max(1, employment.labourSupply), 3),
                              "foodSecurity": town.economy.food.security, "idleMonths": p.idleMonths},
            "milestones": [_event(e, pid, self.label) for e in sorted(milestones, key=lambda e: e.day)],
            "settlementHistory": [{"id": e.id, "date": self.label(e.day), "summary": e.summary, "kind": e.kind}
                                  for e in town_history[: self.cfg["settlementHistory"]]],
            "places": sorted({*(self.place(x) for x in places), *roads}),
            "knowledge": [{"event": e.summary, "learned": self.label(sources[e.id].learnedDay), "how": sources[e.id].how,
                           "confidence": sources[e.id].confidence,
                           "wouldTell": p.personality.honesty > 0.4 or e.visibility in ("settlement", "public")} for e in learned],
            "personality": {**p.personality.model_dump(), **(p.profile.model_dump() if p.profile else {})},
            "outlook": outlook(p, cast, state.trade, town, state.date.day, hooks_now),
            "hooks": hooks_now,
            "restrictions": RESTRICTIONS,
        }
