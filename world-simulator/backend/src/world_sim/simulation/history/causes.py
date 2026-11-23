"""
Causes the simulation itself established, linked after a month's events are numbered.
Only mechanical links are made (the business closed, so its workers lost work; an idle
person turned outlaw after losing work; a smuggler caught, then dismissed). Statistical
influences, such as a food shortage raising the death rate, are facts of the time,
never causes.
"""

from ..people.contracts import Cast, LifeEvent
from .contracts import HistoryEvent

# kind -> earlier kinds of the same person that led to it
PERSONAL = {"outlaw": ("lost-work",), "caught": ("outlaw",), "moved": ("lost-work",), "dismissed": ("smuggling",)}


def stamp_cache(cast: Cast, events: list[HistoryEvent], recent: int) -> Cast:
    """Gives each participant's recent-events cache the canonical id of this month's events (adding an entry when missing)."""
    touched: dict[str, list[HistoryEvent]] = {}
    for e in events:
        if e.source != "generated-prehistory":
            for part in e.participants:
                touched.setdefault(part.personId, []).append(e)
    if not touched:
        return cast
    people = []
    for p in cast.people:
        if p.id in touched:
            cache = list(p.events)
            for e in touched[p.id]:
                slot = next((i for i, x in enumerate(cache) if x.kind == e.kind and x.day == e.day and x.eventId is None), None)
                if slot is None:
                    cache.append(LifeEvent(day=e.day, kind=e.kind, text=e.summary, eventId=e.id))
                else:
                    cache[slot] = cache[slot].model_copy(update={"eventId": e.id})
            p = p.model_copy(update={"events": cache[-recent:]})
        people.append(p)
    return cast.model_copy(update={"people": people})


def link_causes(events: list[HistoryEvent], cast: Cast) -> list[HistoryEvent]:
    """Links each event to the earlier events of the same person (from their recent cache) that the simulation made lead to it."""
    caches = {p.id: p.events for p in cast.people}
    closed = {e.businessId: e.id for e in events if e.kind == "closed" and e.businessId}
    dismissed = [e for e in events if e.kind == "dismissed"]
    out = []
    for e in events:
        causes: list[str] = []
        if e.kind == "lost-work" and e.businessId in closed:
            causes.append(closed[e.businessId])
        if e.kind in PERSONAL and e.participants:
            earlier = [x.eventId for x in caches.get(e.participants[0].personId, [])
                       if x.kind in PERSONAL[e.kind] and x.eventId and int(x.eventId.split(":")[1]) < e.seq]
            causes += earlier[-1:]
        if e.kind == "trader":
            causes += [d.id for d in dismissed if d.routeId == e.routeId]
        out.append(e.model_copy(update={"causedBy": sorted(set(e.causedBy) | set(causes), key=lambda i: int(i.split(":")[1]))})
                   if causes else e)
    return out
