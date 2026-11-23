"""Interventions, replay, comparison, causal traces, consistency checks and metrics (PR8)."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..simulation.interventions import Intervention
from ..simulation.lab import Lab
from ..simulation.manager import ScenarioManager
from .errors import ApiError


def lab_router(manager: ScenarioManager, lab: Lab, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")

    def shown(scenario_id: str, e: Any) -> dict[str, Any]:
        label = manager.labeller(manager.session(scenario_id).state)
        names = {p.id: f"{p.name} {p.family}" for p in manager.session(scenario_id).state.cast.people}
        return {**e.model_dump(), "date": label(e.day),
                "participants": [{**x.model_dump(), "name": names.get(x.personId, x.personId)} for x in e.participants]}

    @router.get("/scenarios/{scenario_id}/interventions/targets")
    async def targets(scenario_id: str) -> JSONResponse:
        """What an intervention can strike: businesses, settlements and routes in scope."""
        session = manager.session(scenario_id)
        state, food = session.state, manager.rules(session)["economy"]["food"]["good"]
        towns = {s.settlementId: s.name for s in state.settlements}
        return reply({
            "settlements": [{"id": s.settlementId, "name": s.name, "granary": round(s.economy.inventory.get(food, 0))}
                            for s in state.settlements],
            "businesses": [{"id": b.id, "name": b.name, "kind": b.kind, "good": b.good, "settlement": s.name, "filled": b.filled,
                            "named": sum(1 for p in state.cast.people if p.alive and p.businessId == b.id)}
                           for s in state.settlements for b in s.society.businesses],
            "routes": [{"id": r.id, "name": f"{towns.get(r.settlementId, r.settlementId)} – {r.centerName}", "mode": r.mode,
                        "bandits": r.bandits} for r in state.trade.routes],
        })

    @router.post("/scenarios/{scenario_id}/interventions", status_code=201)
    async def intervene(scenario_id: str, body: Intervention) -> JSONResponse:
        return reply([shown(scenario_id, e) for e in manager.intervene(scenario_id, body)], status=201)

    @router.post("/scenarios/{scenario_id}/replay")
    async def replay(scenario_id: str) -> JSONResponse:
        return reply(await manager.replay(scenario_id))

    @router.get("/scenarios/{scenario_id}/validation")
    async def validation(scenario_id: str) -> JSONResponse:
        return reply(lab.validate(scenario_id))

    @router.get("/scenarios/{scenario_id}/metrics")
    async def metrics(scenario_id: str) -> JSONResponse:
        return reply(lab.metrics(scenario_id))

    @router.get("/scenarios/{scenario_id}/history/events/{event_id}/trace")
    async def trace(scenario_id: str, event_id: str, depth: int = Query(4, ge=1, le=8)) -> JSONResponse:
        found = lab.trace(scenario_id, event_id, depth)
        if found is None:
            raise ApiError(404, "not_found", f"No event {event_id}", {"id": event_id})
        nodes = [{**shown(scenario_id, n["event"]), "depth": n["depth"]} for n in found["nodes"]]
        return reply({**found, "nodes": nodes})

    @router.get("/compare")
    async def compare(a: str, b: str, aSnapshot: str | None = None, bSnapshot: str | None = None) -> JSONResponse:  # noqa: N803
        return reply(lab.compare({"scenarioId": a, "snapshotId": aSnapshot}, {"scenarioId": b, "snapshotId": bSnapshot}))

    return router
