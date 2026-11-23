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
        unloadable = [{"id": k, "reason": v} for k, v in sorted(manager.unloadable.items())]
        return reply(manager.statuses(), {"unloadable": unloadable} if unloadable else None)

    @router.post("/scenarios", status_code=201)
    async def create_scenario(body: CreateScenario) -> JSONResponse:
        return reply(manager.status(manager.create(body)), status=201)

    @router.get("/scenarios/{scenario_id}")
    async def get_scenario(scenario_id: str) -> JSONResponse:
        return reply(manager.status(manager.session(scenario_id)))

    @router.get("/scenarios/{scenario_id}/state")
    async def get_state(scenario_id: str) -> JSONResponse:
        return reply(manager.session(scenario_id).state.model_dump())

    @router.get("/scenarios/{scenario_id}/businesses")
    async def businesses(scenario_id: str, settlement: str | None = None, sector: str | None = None, q: str | None = None,
                         page: int = Query(1, ge=1), pageSize: int = Query(50, ge=1, le=200)) -> JSONResponse:  # noqa: N803
        rows = [b for s in manager.session(scenario_id).state.settlements if settlement in (None, s.settlementId)
                for b in s.society.businesses]
        needle = (q or "").strip().casefold()
        rows = [b for b in rows if (sector is None or b.sector == sector)
                and (not needle or needle in b.name.casefold() or needle in b.profession or needle in (b.good or "").casefold())]
        start = (page - 1) * pageSize
        meta = {"page": {"page": page, "pageSize": pageSize, "totalItems": len(rows), "totalPages": max(1, -(-len(rows) // pageSize))}}
        return reply([b.model_dump() for b in rows[start:start + pageSize]], meta)

    @router.get("/scenarios/{scenario_id}/businesses/{business_id}")
    async def business(scenario_id: str, business_id: str) -> JSONResponse:
        for s in manager.session(scenario_id).state.settlements:
            for b in s.society.businesses:
                if b.id == business_id:
                    return reply({**b.model_dump(), "settlementName": s.name})
        raise ApiError(404, "not_found", f"No business {business_id}", {"id": business_id})

    @router.get("/scenarios/{scenario_id}/economy")
    async def economy(scenario_id: str, delivered: int = Query(50, ge=0, le=200)) -> JSONResponse:
        """Settlement economies, markets and caravans without the society payload; delivered caravans newest first."""
        state = manager.session(scenario_id).state
        newest = state.trade.delivered[len(state.trade.delivered) - delivered:] if delivered else []
        return reply({
            "date": state.date.model_dump(),
            "settlements": [{"settlementId": s.settlementId, "name": s.name, "population": s.population, "economy": s.economy.model_dump()}
                            for s in state.settlements],
            "markets": [m.model_dump() for m in state.trade.markets],
            "caravans": [c.model_dump() for c in state.trade.caravans],
            "delivered": [c.model_dump() for c in reversed(newest)],
            "routes": [r.model_dump() for r in state.trade.routes],
            "traders": [t.model_dump() for t in state.trade.traders],
        })

    @router.get("/scenarios/{scenario_id}/traders/{trader_id}")
    async def trader(scenario_id: str, trader_id: str) -> JSONResponse:
        """One caravan master's scorecard and the caravans they led that are still on record, newest first."""
        trade = manager.session(scenario_id).state.trade
        found = next((t for t in trade.traders if t.id == trader_id), None)
        if found is None:
            raise ApiError(404, "not_found", f"No trader {trader_id}", {"id": trader_id})
        led = [c.model_dump() for c in reversed([*trade.delivered, *trade.caravans]) if c.traderId == trader_id]
        route = next((r.model_dump() for r in trade.routes if r.id == found.routeId), None)
        return reply({**found.model_dump(), "route": route, "caravans": led})

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
        return reply(list(reversed(manager.snapshot_list(scenario_id))))

    @router.post("/scenarios/{scenario_id}/snapshots", status_code=201)
    async def save_snapshot(scenario_id: str, body: SnapshotRequest) -> JSONResponse:
        return reply(manager.snapshot(scenario_id, body.label).model_dump(), status=201)

    @router.post("/scenarios/{scenario_id}/restore")
    async def restore(scenario_id: str, body: RestoreRequest) -> JSONResponse:
        return reply(manager.status(manager.restore(scenario_id, body.snapshotId)))

    return router
