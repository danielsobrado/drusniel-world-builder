"""FastAPI application: versioned JSON envelopes over the immutable world model."""

import os
import time
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from .. import log
from ..config import load_config
from ..reports.builder import (
    build_budget_comparison,
    build_connectivity_report,
    build_summary,
    config_fingerprint,
    settlement_detail,
    settlement_row,
    world_identity,
)
from ..world.model import WorldModel, build_world_model
from .errors import ApiError, failure, ok
from .settlement_query import parse_settlement_query, query_settlements

LIST_FIELDS = ("id", "sourceId", "name", "stateId", "stateName", "cultureId", "cultureName", "population", "class",
               "capital", "port", "npcs", "pilot")
MARKER_FIELDS = ("id", "sourceId", "name", "class", "capital", "port", "population", "npcs", "pilot", "stateId",
                 "cultureId", "x", "y")


def _pick(row: dict[str, Any], fields: tuple[str, ...]) -> dict[str, Any]:
    return {f: row[f] for f in fields}


def _json(status: int, body: dict[str, Any]) -> JSONResponse:
    return JSONResponse(body, status_code=status, headers={"cache-control": "no-store"})


def create_app(model: WorldModel, static_dir: Path | None = None) -> FastAPI:
    """Payloads are computed once; handlers only read them, so concurrent requests never race."""
    rows = [settlement_row(model, s) for s in model.audit["settlements"]]
    summary = build_summary(model)
    world = {
        **world_identity(model),
        "configFingerprint": config_fingerprint(model.config),
        "mapSize": model.audit["mapSize"],
        "counts": model.audit["counts"],
        "markers": [_pick(r, MARKER_FIELDS) for r in rows],
    }
    connectivity = build_connectivity_report(model, include_settlements=False)
    budget = build_budget_comparison(model)
    pilot = {
        **model.pilot,
        "roles": [{**r, "detail": settlement_detail(model, model.settlements_by_id[r["settlementId"]])}
                  for r in model.pilot["roles"]],
    }
    by_source = {str(s["sourceId"]): s for s in model.audit["settlements"]}
    envelope_world = {"mapId": model.audit["identity"]["mapId"],
                      "sourceFingerprint": model.audit["identity"]["sourceFingerprint"]}
    class_ids = model.config.class_ids

    app = FastAPI(title="Drusniel World Simulator", docs_url="/api/docs", openapi_url="/api/openapi.json", redoc_url=None)
    app.state.model = model

    def reply(data: Any, meta: dict[str, Any] | None = None) -> JSONResponse:
        return _json(200, ok(envelope_world, data, meta))

    @app.exception_handler(ApiError)
    async def _api_error(_: Request, exc: ApiError) -> JSONResponse:
        return _json(exc.status, failure(exc.code, exc.message, exc.details))

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        if exc.status_code == 405:
            return _json(405, failure("method_not_allowed", "The API is read-only"))
        if exc.status_code == 404:
            return _json(404, failure("not_found", f"No endpoint {request.url.path}"))
        return _json(exc.status_code, failure("http_error", str(exc.detail)))

    @app.exception_handler(RequestValidationError)
    async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
        return _json(400, failure("invalid_request", "Request did not validate", {"errors": exc.errors()}))

    @app.exception_handler(Exception)
    async def _unexpected(request: Request, exc: Exception) -> JSONResponse:
        log.error("request failed", exc, method=request.method, path=request.url.path)
        return _json(500, failure("internal_error", "Unexpected server error"))

    @app.get("/api/health")
    def health() -> JSONResponse:
        return reply({"status": "ok"})

    @app.get("/api/world")
    def get_world() -> JSONResponse:
        return reply(world)

    @app.get("/api/world/summary")
    def get_summary() -> JSONResponse:
        return reply(summary)

    @app.get("/api/world/connectivity")
    def get_connectivity() -> JSONResponse:
        return reply(connectivity)

    @app.get("/api/world/npc-budget")
    def get_budget() -> JSONResponse:
        return reply(budget)

    @app.get("/api/world/pilot")
    def get_pilot() -> JSONResponse:
        return reply(pilot)

    @app.get("/api/world/settlements")
    def list_settlements(request: Request) -> JSONResponse:
        query = parse_settlement_query(dict(request.query_params), model.config.simulator["api"], class_ids)
        result = query_settlements(rows, query)
        return reply([_pick(r, LIST_FIELDS) for r in result["items"]],
                     {"page": result["page"], "sort": query["sort"], "order": query["order"]})

    @app.get("/api/world/settlements/{settlement_id}")
    def get_settlement(settlement_id: str) -> JSONResponse:
        settlement = model.settlements_by_id.get(settlement_id) or by_source.get(settlement_id)
        if settlement is None:
            raise ApiError(404, "not_found", f"No settlement {settlement_id}", {"id": settlement_id})
        return reply(settlement_detail(model, settlement))

    if static_dir is not None:
        root = static_dir.resolve()

        @app.get("/{path:path}", include_in_schema=False)
        def frontend(path: str) -> FileResponse:
            if path.startswith("api/"):
                raise StarletteHTTPException(404)
            file = (root / unquote(path)).resolve()
            if not file.is_relative_to(root):
                raise ApiError(400, "invalid_path", "Path escapes the frontend bundle")
            return FileResponse(file if file.is_file() else root / "index.html")

    return app


def create_app_from_env() -> FastAPI:
    """uvicorn factory: loads config, builds the world once, optionally serves frontend/dist."""
    config = load_config()
    started = time.perf_counter()
    model = build_world_model(config)
    log.info("world loaded", mapId=model.audit["identity"]["mapId"],
             sourceFingerprint=model.audit["identity"]["sourceFingerprint"],
             settlements=model.audit["counts"]["settlements"], ms=round((time.perf_counter() - started) * 1000))
    static_dir = config.root / "frontend/dist" if os.environ.get("WS_SERVE_FRONTEND") == "1" else None
    if static_dir is not None and not static_dir.is_dir():
        raise FileNotFoundError("frontend/dist is missing; run npm run build first")
    return create_app(model, static_dir)
