"""Upgrades saved scenario states to the current schema. Each step is deterministic."""

from typing import Any

from ..world.model import WorldModel
from .contracts import STATE_SCHEMA_VERSION, Cohorts, ScenarioState
from .society import initial_society


class IncompatibleState(ValueError):
    pass


def _v1_to_v2(raw: dict[str, Any], model: WorldModel, society_cfg: dict[str, Any]) -> dict[str, Any]:
    """v2 adds society, derived from each settlement's v1 cohorts and its imported record."""
    settlements = []
    for s in raw["settlements"]:
        record = model.settlements_by_id.get(s["settlementId"])
        if record is None:
            raise IncompatibleState(f"settlement {s['settlementId']} is not in the loaded map")
        society = initial_society(record, Cohorts(**s["cohorts"]), society_cfg)
        settlements.append({**s, "society": society.model_dump()})
    return {**raw, "schemaVersion": 2, "settlements": settlements}


STEPS = {1: _v1_to_v2}


def migrate_state(raw: dict[str, Any], model: WorldModel, society_cfg: dict[str, Any]) -> tuple[ScenarioState, int]:
    """Returns the state at the current schema and the version it was stored at."""
    stored = int(raw.get("schemaVersion", 1))
    if stored > STATE_SCHEMA_VERSION:
        raise IncompatibleState(f"state schema {stored} is newer than this simulator ({STATE_SCHEMA_VERSION})")
    while int(raw.get("schemaVersion", 1)) < STATE_SCHEMA_VERSION:
        raw = STEPS[int(raw.get("schemaVersion", 1))](raw, model, society_cfg)
    return ScenarioState(**raw), stored
