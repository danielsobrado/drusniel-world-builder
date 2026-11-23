"""History and character research: a person's timeline, relationships, knowledge and biography context, and single events."""

import json
from collections.abc import Callable
from contextlib import closing
from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..simulation.history.contracts import HistoryEvent
from ..simulation.manager import ScenarioManager
from ..simulation.people.context import ContextBuilder
from .errors import ApiError


def history_router(manager: ScenarioManager, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api/scenarios/{scenario_id}")

    def setup(scenario_id: str) -> tuple[Any, Any, Callable[[int], str]]:
        session = manager.session(scenario_id)
        return session, session.state, manager.labeller(session.state)

    def person_of(state: Any, pid: str) -> Any:
        found = next((p for p in state.cast.people if p.id == pid), None)
        if found is None:
            raise ApiError(404, "not_found", f"No person {pid}", {"id": pid})
        return found

    def names(state: Any) -> dict[str, str]:
        return {p.id: f"{p.name} {p.family}" for p in state.cast.people}

    def shown(e: HistoryEvent, label: Callable[[int], str], who: dict[str, str]) -> dict[str, Any]:
        return {**e.model_dump(), "date": label(e.day),
                "participants": [{**x.model_dump(), "name": who.get(x.personId, x.personId)} for x in e.participants]}

    @router.get("/people/{person_id}/timeline")
    async def timeline(scenario_id: str, person_id: str, category: Annotated[list[str] | None, Query()] = None,
                       source: Annotated[list[str] | None, Query()] = None,
                       minImportance: int = Query(1, ge=1, le=5), fromDay: int | None = None, toDay: int | None = None) -> JSONResponse:  # noqa: N803
        _, state, label = setup(scenario_id)
        person_of(state, person_id)
        events = manager.archive(scenario_id).query(person=person_id, categories=category, sources=source, min_importance=minImportance,
                                                    from_day=fromDay, to_day=toDay, limit=None)
        who = names(state)
        meta = {"categories": manager.archive(scenario_id).summary(person_id)}
        return reply([shown(e, label, who) for e in events], meta)

    @router.get("/people/{person_id}/relationships")
    async def relationships(scenario_id: str, person_id: str) -> JSONResponse:
        _, state, label = setup(scenario_id)
        person_of(state, person_id)
        builder = ContextBuilder(state, manager.archive(scenario_id), manager.rules(manager.session(scenario_id)),
                                 manager.model.settlements_by_id, label)
        return reply(builder.relationships(person_id))

    @router.get("/people/{person_id}/knowledge")
    async def knowledge(scenario_id: str, person_id: str) -> JSONResponse:
        _, state, label = setup(scenario_id)
        p = person_of(state, person_id)
        archive = manager.archive(scenario_id)
        learned = {e.id: e for e in archive.many([k.eventId for k in p.knowledge])}
        who = names(state)
        second = [{**k.model_dump(), "learned": label(k.learnedDay), "from": who.get(k.fromId or "", None),
                   "event": shown(learned[k.eventId], label, who) if k.eventId in learned else None} for k in reversed(p.knowledge)]
        first_hand = len(archive.query(person=person_id, limit=None))
        return reply({"firstHand": first_hand, "secondHand": second})

    @router.get("/people/{person_id}/context")
    async def context(scenario_id: str, person_id: str) -> JSONResponse:
        """Everything a biography of this person may use, and the rules against inventing more."""
        _, state, label = setup(scenario_id)
        person_of(state, person_id)
        builder = ContextBuilder(state, manager.archive(scenario_id), manager.rules(manager.session(scenario_id)),
                                 manager.model.settlements_by_id, label)
        return reply(builder.build(person_id))

    @router.get("/history/events/{event_id}")
    async def event(scenario_id: str, event_id: str) -> JSONResponse:
        _, state, label = setup(scenario_id)
        archive = manager.archive(scenario_id)
        found = archive.get(event_id)
        if found is None:
            raise ApiError(404, "not_found", f"No event {event_id}", {"id": event_id})
        who = names(state)
        with closing(archive._db()) as db:  # consequences: later events that name this one as a cause
            rows = db.execute("SELECT body FROM events WHERE seq > ? AND body LIKE ? ORDER BY seq LIMIT 20",
                              (found.seq, f'%"{event_id}"%')).fetchall()
        consequences = [e for e in (HistoryEvent(**json.loads(r[0])) for r in rows) if event_id in e.causedBy]
        return reply({**shown(found, label, who), "causes": [shown(e, label, who) for e in archive.many(found.causedBy)],
                      "consequences": [shown(e, label, who) for e in consequences]})

    return router
