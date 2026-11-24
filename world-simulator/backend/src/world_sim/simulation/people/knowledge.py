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


def spread(cast: Cast, events: list[HistoryEvent], trade: Trade, day: int, cfg: dict[str, Any], month: int) -> tuple[Cast, Trade]:
    """Second-hand knowledge from this batch of events; returns the cast and the trade (caravans pick up news as they leave).
    `month` is the calendar's month length: caravans that arrived within the last one deliver what they carry."""
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
                    tell(ties.other(rel, teller.id), e.id, "told", teller.id, cfg["friend"], witnesses)
    # Rumours travel with caravans: a master leaving home takes its public news along, and on reaching the market centre
    # tells its innkeepers and hears the centre's own news. Nothing arrives before the caravan does.
    centres = {m.marketId: m.centerSettlementId for m in trade.markets}
    holders = {p.traderId: p for p in people.values() if p.alive and p.traderId}
    innkeepers = [p for p in people.values() if p.alive and p.profession == "innkeeper"]
    public = [e for e in worth if e.visibility in ("settlement", "public") and e.settlementId
              and e.importance >= cfg.get("rumourMinImportance", cfg["minImportance"])]
    caravans = []
    for c in trade.caravans:
        if c.departDay == day and c.kind == "sale" and c.traderId in holders:
            carried = [e.id for e in public if e.settlementId == c.fromId and e.id not in c.news]
            c = c.model_copy(update={"news": [*c.news, *carried]}) if carried else c
        caravans.append(c)
    for c in trade.delivered:
        if not (day - month < c.arriveDay <= day and c.kind == "sale" and c.traderId in holders):
            continue
        master, centre = holders[c.traderId], centres.get(c.marketId)
        for e in public:
            if e.settlementId == centre:
                tell(master.id, e.id, "rumour", None, cfg["rumour"], frozenset(x.personId for x in e.participants))
        for event_id in c.news:
            for inn in (p for p in innkeepers if p.settlementId == centre):
                tell(inn.id, event_id, "rumour", master.id, cfg["rumour"])
    trade = trade.model_copy(update={"caravans": caravans}) if caravans != trade.caravans else trade
    if not learned:
        return cast, trade
    keep = cfg["maxEntries"]
    return cast.model_copy(update={"people": [p.model_copy(update={"knowledge": [*p.knowledge, *learned[p.id]][-keep:]}) if p.id in learned
                                              else p for p in cast.people]}), trade
