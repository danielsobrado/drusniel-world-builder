"""
Second-hand knowledge. What a person took part in is known first-hand (from the event's
participants) and what is public in their town is local knowledge (from visibility);
neither is stored. Stored here is only what reached them otherwise: told by someone in
their household or a friend who was there, or a rumour carried along a road by a caravan
master, each with when, from whom and how sure they are.
"""

from typing import Any

from ..economy.contracts import Trade
from ..history.contracts import HistoryEvent
from .contracts import Cast, Knowledge
from .relationships import Ties


def spread(cast: Cast, events: list[HistoryEvent], trade: Trade, day: int, cfg: dict[str, Any]) -> Cast:
    people = {p.id: p for p in cast.people}
    ties = Ties(cast.relationships, cast.relSeq)
    learned: dict[str, list[Knowledge]] = {}

    def tell(pid: str, e: HistoryEvent, how: str, source: str, confidence: float) -> None:
        p = people.get(pid)
        if p is None or not p.alive or pid in {x.personId for x in e.participants}:
            return
        if any(k.eventId == e.id for k in [*p.knowledge, *learned.get(pid, [])]):
            return
        learned.setdefault(pid, []).append(Knowledge(eventId=e.id, learnedDay=day, how=how, fromId=source, confidence=confidence))

    worth = [e for e in events if e.importance >= cfg["minImportance"] and e.visibility != "private" and e.source != "generated-prehistory"]
    for e in worth:
        for part in e.participants:
            teller = people.get(part.personId)
            if teller is None:
                continue
            for other in people.values():
                if other.householdId == teller.householdId:
                    tell(other.id, e, "told", teller.id, cfg["told"])
            if e.importance >= 4:
                for rel in ties.of(teller.id, "friend"):
                    tell(ties.other(rel, teller.id), e, "told", teller.id, cfg["friend"])
    # Rumours: a master on the road this month carries news each way between home and the market centre.
    centres = {m.marketId: m.centerSettlementId for m in trade.markets}
    holders = {p.traderId: p for p in people.values() if p.alive and p.traderId}
    innkeepers = [p for p in people.values() if p.alive and p.profession == "innkeeper"]
    public = [e for e in worth if e.visibility in ("settlement", "public") and e.settlementId
              and e.importance >= cfg.get("rumourMinImportance", cfg["minImportance"])]
    for c in (c for c in trade.caravans if c.departDay == day and c.kind == "sale" and c.traderId in holders):
        master, home, centre = holders[c.traderId], c.fromId, centres.get(c.marketId)
        for e in public:
            if e.settlementId == centre:
                tell(master.id, e, "rumour", None, cfg["rumour"])
            if e.settlementId == home:
                for inn in (p for p in innkeepers if p.settlementId == centre):
                    tell(inn.id, e, "rumour", master.id, cfg["rumour"])
    if not learned:
        return cast
    keep = cfg["maxEntries"]
    return cast.model_copy(update={"people": [p.model_copy(update={"knowledge": [*p.knowledge, *learned[p.id]][-keep:]}) if p.id in learned
                                              else p for p in cast.people]})
