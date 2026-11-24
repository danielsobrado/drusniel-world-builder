"""Second-hand accounts shared among witnesses and nearby family and friends."""

from typing import Any

from ...peoples.decisions import Opportunity, preferences, rank
from ..history.contracts import HistoryEvent
from .contracts import Cast, Knowledge
from .relationships import Ties


def spread(cast: Cast, events: list[HistoryEvent], day: int, cfg: dict[str, Any], profiles: dict) -> Cast:
    """Hear an account directly from a witness who is physically present."""
    people = {p.id: p for p in cast.people}
    ties = Ties(cast.relationships, cast.relSeq)
    learned: dict[str, list[Knowledge]] = {}

    def tell(pid: str, event_id: str, how: str, source: str | None, confidence: float, witnesses: frozenset[str] = frozenset()) -> None:
        p = people.get(pid)
        if p is None or not p.alive or pid in witnesses:
            return
        if any(k.eventId == event_id for k in [*p.knowledge, *learned.get(pid, [])]):
            return
        learned.setdefault(pid, []).append(Knowledge(eventId=event_id, learnedDay=day, how=how, fromId=source, confidence=confidence))

    worth = [e for e in events if e.importance >= cfg["minImportance"] and e.visibility != "private" and e.source != "generated-prehistory"]
    for e in worth:
        witnesses = frozenset(x.personId for x in e.participants)
        for part in e.participants:
            teller = people.get(part.personId)
            if teller is None:
                continue
            for other in people.values():
                if other.householdId == teller.householdId:
                    tell(other.id, e.id, "told", teller.id, cfg["told"], witnesses)
            if e.importance >= 4:
                for rel in ties.of(teller.id, "friend"):
                    listener = people.get(ties.other(rel, teller.id))
                    if not listener or listener.settlementId != teller.settlementId or listener.journeyId != teller.journeyId:
                        continue
                    weights = preferences(teller.identity, teller.upbringing, None, profiles)
                    share = Opportunity("share", 0.3, 0.10, relationship=rel.trust)
                    keep = Opportunity("keep", 0, 0, {"discretion": 0.85})
                    if e.visibility == "public" or rank([share, keep], weights, greed=teller.personality.greed,
                                                        caution=teller.personality.caution,
                                                        trust=teller.personality.honesty)[0]["id"] == "share":
                        tell(ties.other(rel, teller.id), e.id, "told", teller.id, cfg["friend"], witnesses)
    if not learned:
        return cast
    keep = cfg["maxEntries"]
    return cast.model_copy(update={"people": [p.model_copy(update={"knowledge": [*p.knowledge, *learned[p.id]][-keep:]}) if p.id in learned
                                              else p for p in cast.people]})
