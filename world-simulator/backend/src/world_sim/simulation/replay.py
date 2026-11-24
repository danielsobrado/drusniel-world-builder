"""
Deterministic replay. Every change to a scenario is a command in its journal (advance N
days, an intervention, a player event); snapshots mark their place in it. Replaying
rebuilds the baseline from the map, the seed and the frozen rules, re-applies the
commands, and must arrive at the same state checksum and the same history, event for
event. A scenario made before journals existed has none and cannot be replayed.
"""

import hashlib
from collections.abc import Iterable
from typing import Any

from ..canonical import compact_json
from ..world.model import WorldModel
from .contracts import ScenarioMeta, ScenarioState
from .engine import advance_frames, baseline_state
from .history.contracts import HistoryEvent
from .history.recorder import on_timelines, record
from .interventions import Intervention, intervene
from .people.backstory import with_backstory
from .scope import resolve_scope
from .travel_news import remember


def player_event(state: ScenarioState, incident: dict[str, Any], rules: dict[str, Any]) -> tuple[ScenarioState, list[HistoryEvent]]:
    """Something the player did with a person (a first meeting), as canonical history."""
    history = rules["simulation"]["history"]
    event = record(incident, state.historySeq, state.date.day, history, source="player", precision="day")
    cast = on_timelines(state.cast, [event], history["timelineMinImportance"])
    knowledge = rules["simulation"]["people"]["knowledge"]
    travel = remember(state.travel, [event], knowledge.get("rumourMinImportance", knowledge["minImportance"]),
                      rules["simulation"]["travel"]["newsPerSettlement"])
    return state.model_copy(update={"cast": cast, "travel": travel, "historySeq": state.historySeq + 1}), [event]


def with_past(state: ScenarioState, rules: dict[str, Any]) -> tuple[ScenarioState, list[HistoryEvent]]:
    """Reconstructs the past of everyone on record without one (everyone, at creation)."""
    if all(p.backstory or not p.alive for p in state.cast.people):
        return state, []
    cast, events = with_backstory(state.cast, state.historySeq, state.date.day, state.settlements, rules, state.seed)
    return state.model_copy(update={"cast": cast, "historySeq": state.historySeq + len(events)}), events


Applied = tuple[ScenarioState, list[HistoryEvent], list[dict[str, Any]]]


def apply(state: ScenarioState, op: dict[str, Any], rules: dict[str, Any]) -> Applied:
    """One journal command; returns the state, its events and (for an advance) the month summaries."""
    if op["op"] == "advance":
        state, months = advance_frames(state, op["days"], rules)
        return state, [e for m in months for e in m["events"]], months
    if op["op"] == "intervene":
        state, events = intervene(state, Intervention(**op["spec"]), rules)
        return state, events, []
    if op["op"] == "player":
        state, events = player_event(state, op["incident"], rules)
        return state, events, []
    return state, [], []         # "mark": a snapshot's place in the journal


def event_digest(events: Iterable[HistoryEvent]) -> str:
    h = hashlib.sha256()
    for e in events:
        h.update(compact_json(e.model_dump(mode="json")).encode())
    return "sha256:" + h.hexdigest()


def replay(model: WorldModel, meta: ScenarioMeta, start_year: int, rules: dict[str, Any],
           journal: list[dict[str, Any]]) -> tuple[ScenarioState, list[HistoryEvent]]:
    """Rebuilds the scenario from its baseline and journal; returns the state and every event it recorded."""
    ids = resolve_scope(model, meta.scope, rules["simulation"]["limits"]["maxScopeSettlements"])
    state = baseline_state(model, scenario_id=meta.journalRoot or meta.id, settlement_ids=ids, seed=meta.seed, start_year=start_year,
                           rules=rules)
    state, events = with_past(state, rules)
    for op in journal:
        state, more, _ = apply(state, op, rules)
        events += more
    return state.model_copy(update={"scenarioId": meta.id}), events
