"""Scenario population, catalog provenance and controlled culture comparisons."""

from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from ..peoples.decisions import SCENARIOS, rank
from ..simulation.contracts import SettlementState
from ..simulation.manager import ScenarioManager
from .errors import ApiError


def peoples_router(manager: ScenarioManager, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/scenarios/{scenario_id}/peoples")
    async def peoples(scenario_id: str) -> JSONResponse:
        session = manager.session(scenario_id)
        state = session.state
        frozen = manager.rules(session)
        rules = frozen["peoples"]
        towns = manager.model.settlements_by_id if not session.read_only else {}
        return reply({
            "catalogId": rules.get("catalogId"), "cultures": rules.get("cultures", {}), "ancestries": rules.get("ancestries", {}),
            "profiles": rules.get("profiles", {}), "comparisonScenarios": list(SCENARIOS),
            "settlements": [_settlement(s, towns.get(s.settlementId, {})) for s in state.settlements],
            "history": [{"day": h.day, "population": h.ancestryPopulation} for h in state.history if h.ancestryPopulation],
            "neutralParameters": {"demography": frozen["simulation"]["demography"],
                                  "ages": frozen["simulation"]["people"]["ages"]},
        })

    @router.get("/scenarios/{scenario_id}/peoples/compare")
    async def compare(scenario_id: str, left: str, right: str,
                      scenario: Literal["trade", "shortage", "migration", "housing", "dispute", "information"] = "trade",
                      urgency: float = Query(0, ge=0, le=1), greed: float = Query(0.5, ge=0, le=1),
                      caution: float = Query(0.5, ge=0, le=1), trust: float = Query(0.5, ge=0, le=1)) -> JSONResponse:
        config = manager.rules(manager.session(scenario_id))["peoples"]

        def evaluation(key: str) -> dict:
            if key != "neutral" and key not in config.get("cultures", {}):
                raise ApiError(400, "invalid_culture", f"Unknown culture or seed {key}")
            profile = config.get("profiles", {}).get(key, {})
            ranked = rank(SCENARIOS[scenario], profile.get("preferences", {}), greed=greed, caution=caution, trust=trust,
                          urgency=urgency)
            return {"id": key, "status": "experimental", "choice": ranked[0]["id"], "options": ranked}

        return reply({"scenario": scenario, "urgency": urgency, "left": evaluation(left), "right": evaluation(right)})

    return router


def _settlement(s: SettlementState, source: dict) -> dict:
    polity = source.get("stateName") if s.identity.polityId == source.get("stateId") else s.identity.polityId
    return {
        "id": s.settlementId, "name": s.name, "population": s.population, "identity": s.identity.model_dump(),
        "ancestries": {key: cohorts.model_dump() for key, cohorts in s.ancestries.items()},
        "infrastructure": [item.model_dump() for item in s.infrastructure],
        "x": source.get("x"), "y": source.get("y"), "polity": polity,
    }
