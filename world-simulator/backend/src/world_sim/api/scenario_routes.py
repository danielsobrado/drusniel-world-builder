"""Scenario endpoints. Handlers are async so they run on the loop that owns scenario state."""

from collections.abc import Callable
from typing import Any

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..simulation.contracts import CreateScenario, RestoreRequest, RunRequest, SnapshotRequest, StepRequest
from ..simulation.manager import ScenarioManager
from .errors import ApiError


def scenario_router(manager: ScenarioManager, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")
    config = manager.config

    @router.get("/simulation")
    async def simulation_config() -> JSONResponse:
        return reply({
            "stepSizes": config["stepSizes"],
            "speeds": config["speeds"],
            "calendar": config["calendar"],
            "startYear": manager.start_year,
            "limits": config["limits"],
            "scopeTypes": ["pilot", "state", "province", "settlements"],
            "demography": config["demography"],
        })

    @router.get("/scenarios")
    async def list_scenarios() -> JSONResponse:
        return reply(manager.list())

    @router.post("/scenarios", status_code=201)
    async def create_scenario(body: CreateScenario) -> JSONResponse:
        return reply(manager.status(manager.create(body)), status=201)

    @router.get("/scenarios/{scenario_id}")
    async def get_scenario(scenario_id: str) -> JSONResponse:
        return reply(manager.status(manager.session(scenario_id)))

    @router.get("/scenarios/{scenario_id}/state")
    async def get_state(scenario_id: str) -> JSONResponse:
        return reply(manager.session(scenario_id).state.model_dump())

    @router.post("/scenarios/{scenario_id}/step")
    async def step(scenario_id: str, body: StepRequest) -> JSONResponse:
        if (body.days is None) == (body.unit is None):
            raise ApiError(400, "invalid_parameter", "Give exactly one of days or unit", {"parameter": "days"})
        days = body.days if body.days is not None else config["stepSizes"][body.unit]
        return reply(manager.status(manager.step(scenario_id, days)))

    @router.post("/scenarios/{scenario_id}/run")
    async def run(scenario_id: str, body: RunRequest) -> JSONResponse:
        return reply(manager.status(manager.run(scenario_id, body.speed)))

    @router.post("/scenarios/{scenario_id}/pause")
    async def pause(scenario_id: str) -> JSONResponse:
        return reply(manager.status(await manager.pause(scenario_id)))

    @router.get("/scenarios/{scenario_id}/events")
    async def events(scenario_id: str, limit: int = Query(100, ge=1, le=1000)) -> JSONResponse:
        recent: list[Any] = manager.session(scenario_id).events[-limit:]
        return reply([e.model_dump() for e in reversed(recent)])

    @router.get("/scenarios/{scenario_id}/snapshots")
    async def snapshots(scenario_id: str) -> JSONResponse:
        manager.session(scenario_id)
        return reply([m.model_dump() for m in reversed(manager.store.snapshots(scenario_id))])

    @router.post("/scenarios/{scenario_id}/snapshots", status_code=201)
    async def save_snapshot(scenario_id: str, body: SnapshotRequest) -> JSONResponse:
        return reply(manager.snapshot(scenario_id, body.label).model_dump(), status=201)

    @router.post("/scenarios/{scenario_id}/restore")
    async def restore(scenario_id: str, body: RestoreRequest) -> JSONResponse:
        return reply(manager.status(manager.restore(scenario_id, body.snapshotId)))

    return router
