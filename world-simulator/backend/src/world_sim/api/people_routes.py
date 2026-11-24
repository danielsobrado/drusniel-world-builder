"""Named people of a scenario: a paged, filtered list and one person with their household and story."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..simulation.manager import ScenarioManager
from ..simulation.people.contracts import Person
from ..simulation.people.generate import age_years
from .errors import ApiError


def people_router(manager: ScenarioManager, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")

    def calendar(scenario_id: str) -> dict[str, Any]:
        """The scenario's people rules, whose `daysPerYear` comes from its frozen calendar."""
        return manager.rules(manager.session(scenario_id))["simulation"]["people"]

    def summary(p: Person, day: int, places: dict[str, str], workplaces: dict[str, str], cfg: dict[str, Any]) -> dict[str, Any]:
        row = p.model_dump(exclude={"events"})
        return {**row, "age": age_years(p, p.deathDay if not p.alive and p.deathDay is not None else day, cfg),
                "settlementName": places.get(p.settlementId, ""), "workplace": workplaces.get(p.businessId or "")}

    @router.get("/scenarios/{scenario_id}/people")
    async def people(scenario_id: str, settlement: str | None = None, role: str | None = None, q: str | None = None,
                     alive: bool = True, page: int = Query(1, ge=1), pageSize: int = Query(50, ge=1, le=200)) -> JSONResponse:  # noqa: N803
        state = manager.session(scenario_id).state
        places = {s.settlementId: s.name for s in state.settlements}
        workplaces = {b.id: b.name for s in state.settlements for b in s.society.businesses}
        needle = (q or "").strip().casefold()
        rows = [p for p in state.cast.people if p.alive == alive and settlement in (None, p.settlementId) and role in (None, p.role)
                and (not needle or needle in f"{p.name} {p.family} {p.profession or ''}".casefold())]
        start = (page - 1) * pageSize
        meta = {"page": {"page": page, "pageSize": pageSize, "totalItems": len(rows), "totalPages": max(1, -(-len(rows) // pageSize))},
                "roles": dict(sorted({r: sum(1 for p in state.cast.people if p.alive and p.role == r)
                                      for r in {p.role for p in state.cast.people}}.items())),
                "deaths": state.cast.deaths, "births": state.cast.births, "arrivals": state.cast.arrivals,
                "settlements": [{"id": s.settlementId, "name": s.name, "budget": state.cast.budget.get(s.settlementId, 0)}
                                for s in state.settlements]}
        cfg = calendar(scenario_id)
        return reply([summary(p, state.date.day, places, workplaces, cfg) for p in rows[start:start + pageSize]], meta)

    @router.get("/scenarios/{scenario_id}/people/{person_id}")
    async def person(scenario_id: str, person_id: str) -> JSONResponse:
        state = manager.session(scenario_id).state
        found = next((p for p in state.cast.people if p.id == person_id), None)
        if found is None:
            raise ApiError(404, "not_found", f"No person {person_id}", {"id": person_id})
        places = {s.settlementId: s.name for s in state.settlements}
        workplaces = {b.id: b.name for s in state.settlements for b in s.society.businesses}
        household = next(h for h in state.cast.households if h.id == found.householdId)
        cfg = calendar(scenario_id)
        members = [{"id": p.id, "name": p.name, "age": age_years(p, state.date.day, cfg), "role": p.role, "alive": p.alive}
                   for p in state.cast.people if p.householdId == household.id and p.id != found.id]
        route = next((r.model_dump() for r in state.trade.routes if r.id == found.routeId), None)
        caravan = next((c.id for c in state.trade.caravans
                        if c.carrierId == found.id and c.departDay <= state.date.day < c.arriveDay), None)
        return reply({"activeCaravanId": caravan, **summary(found, state.date.day, places, workplaces, cfg),
                      "events": [e.model_dump() for e in reversed(found.events)],
                      "household": {**household.model_dump(), "members": members}, "route": route})

    return router
