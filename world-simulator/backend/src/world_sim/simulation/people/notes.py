"""Recording a change in a person's life: their recent-events cache, and the canonical event the engine archives."""

from typing import Any

from .contracts import LifeEvent, Person


def note(p: Person, m: Any, kind: str, text: str, *, message: str | None = None, related: dict[str, Any] | None = None,
         emit: bool = True, **update: Any) -> Person:
    """Records a change in a person's life: in their recent-events cache and, unless `emit` is off, as a canonical event."""
    events = [*p.events, LifeEvent(day=m.day, kind=kind, text=text)][-m.recent:]
    if emit:
        m.incidents.append({"kind": kind, "message": message or f"{p.name} {p.family}: {text}", "person": p.id,
                            "settlementId": p.settlementId, **(related or {})})
    return p.model_copy(update={**update, "events": events})
