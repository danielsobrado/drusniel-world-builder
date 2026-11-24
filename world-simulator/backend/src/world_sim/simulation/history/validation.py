"""Checks a stretch of canonical history against the state it describes; returns the problems found."""

from collections.abc import Iterable
from typing import Any

from .contracts import HistoryEvent


def check_events(events: Iterable[HistoryEvent], state: Any, known_businesses: set[str] | None = None) -> list[str]:
    people = {p.id: p for p in state.cast.people}
    settlements = {s.settlementId for s in state.settlements} | {m.centerSettlementId for m in state.trade.markets}
    routes = {r.id for r in state.trade.routes} | {r.id for r in state.travel.routes}
    businesses = (known_businesses or set()) | {b.id for s in state.settlements for b in s.society.businesses}
    problems = []
    for e in events:
        for p in e.participants:
            person = people.get(p.personId)
            if person is None:
                problems.append(f"{e.id}: unknown person {p.personId}")
            elif e.day < person.birthDay:
                problems.append(f"{e.id}: {p.personId} takes part before being born")
            elif person.deathDay is not None and e.day > person.deathDay:
                problems.append(f"{e.id}: {p.personId} takes part after dying")
        if e.settlementId and e.settlementId not in settlements:
            problems.append(f"{e.id}: unknown settlement {e.settlementId}")
        if e.routeId and e.routeId not in routes:
            problems.append(f"{e.id}: unknown route {e.routeId}")
        if e.businessId and e.businessId not in businesses:
            problems.append(f"{e.id}: unknown business {e.businessId}")
        if any(c.startswith("event:") and int(c.split(":")[1]) >= e.seq for c in e.causedBy):
            problems.append(f"{e.id}: caused by a later event")
    return problems
