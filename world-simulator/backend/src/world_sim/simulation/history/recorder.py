"""
Turns the incidents a month produces into canonical history events. The kind sets the
category, importance and visibility (config: simulation.history.kinds) unless the
incident overrides them; ids come from the scenario's event counter, so identical runs
record identical histories.
"""

from typing import Any

from ..people.contracts import Cast
from .contracts import HistoryEvent, Participant

FIELDS = ("settlementId", "locationId", "routeId", "businessId", "caravanId", "householdId", "relatedEntities", "facts",
          "causedBy", "effects")


def record(incident: dict[str, Any], seq: int, day: int, cfg: dict[str, Any], *, source: str = "simulation",
           precision: str = "month") -> HistoryEvent:
    category, importance, visibility = cfg["kinds"].get(incident["kind"], cfg["default"])
    participants = incident.get("participants") or ([{"personId": incident["person"], "role": incident.get("role", "subject")}]
                                                     if incident.get("person") else [])
    return HistoryEvent(
        id=f"event:{seq}", seq=seq, day=incident.get("day", day), datePrecision=incident.get("precision", precision),
        kind=incident["kind"], category=incident.get("category", category), source=incident.get("source", source),
        participants=[Participant(**p) for p in participants], importance=incident.get("importance", importance),
        visibility=incident.get("visibility", visibility), summary=incident["message"],
        **{k: incident[k] for k in FIELDS if incident.get(k) is not None})


def on_timelines(cast: Cast, events: list[HistoryEvent], min_importance: int) -> Cast:
    """Adds the significant events to each participant's permanent timeline."""
    adds: dict[str, list[str]] = {}
    for e in events:
        if e.importance >= min_importance:
            for p in e.participants:
                adds.setdefault(p.personId, []).append(e.id)
    if not adds:
        return cast
    people = [p.model_copy(update={"timeline": [*p.timeline, *[i for i in adds[p.id] if i not in p.timeline]]}) if p.id in adds else p
              for p in cast.people]
    return cast.model_copy(update={"people": people})


def with_origins(cast: Cast, incidents: list[dict[str, Any]], events: list[HistoryEvent]) -> Cast:
    """Points each relationship a month created at the event that created it."""
    origin = {tie: e.id for incident, e in zip(incidents, events, strict=True) for tie in incident.get("ties") or []}
    if not origin:
        return cast
    rels = [r.model_copy(update={"origin": origin[r.id]}) if r.id in origin else r for r in cast.relationships]
    return cast.model_copy(update={"relationships": rels})
