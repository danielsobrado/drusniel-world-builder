"""The game export (PR9): preview it, or write it where the game loads it from."""

import asyncio
from collections.abc import Callable

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..export.game import GameExport
from ..simulation.manager import ScenarioManager


def export_router(manager: ScenarioManager, export: GameExport, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api/scenarios/{scenario_id}/export/game")
    cfg = manager.model.config

    @router.get("")
    async def preview(scenario_id: str) -> JSONResponse:
        index, files = await asyncio.to_thread(export.build, scenario_id)
        return reply({"index": index, "files": files})

    @router.post("", status_code=201)
    async def write(scenario_id: str) -> JSONResponse:
        # The directory is configuration only (simulator.yaml gameExport, or WS_GAME_EXPORT_DIR); no request names a path.
        directory = (cfg.root / cfg.simulator["gameExport"]["directory"]).resolve()
        manager.session(scenario_id)
        return reply(await asyncio.to_thread(export.write, scenario_id, directory), status=201)

    return router
