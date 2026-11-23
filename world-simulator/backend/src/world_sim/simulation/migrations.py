"""Upgrades saved scenario states to the current schema. Each step is deterministic."""

from typing import Any

from ..world.model import WorldModel
from .contracts import STATE_SCHEMA_VERSION, Cohorts, ScenarioState, Society
from .engine import build_settlements
from .society import initial_society


class IncompatibleState(ValueError):
    pass


def _record(model: WorldModel, settlement: dict[str, Any]) -> dict[str, Any]:
    record = model.settlements_by_id.get(settlement["settlementId"])
    if record is None:
        raise IncompatibleState(f"settlement {settlement['settlementId']} is not in the loaded map")
    return record


def _v1_to_v2(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v2 adds society, derived from each settlement's v1 cohorts and its imported record."""
    society_cfg = model.config.society
    settlements = [{**s, "society": initial_society(_record(model, s), Cohorts(**s["cohorts"]), society_cfg).model_dump()}
                   for s in raw["settlements"]]
    return {**raw, "schemaVersion": 2, "settlements": settlements}


def _v2_to_v3(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v3 adds the economy, read from the imported map as at a baseline, around the saved society."""
    rows = [({k: s[k] for k in ("settlementId", "sourceId", "name", "population", "births", "deaths")}, _record(model, s),
             Cohorts(**s["cohorts"]), Society(**s["society"])) for s in raw["settlements"]]
    settlements, trade = build_settlements(model, rows, model.config.rules)
    return {**raw, "schemaVersion": 3, "settlements": [s.model_dump() for s in settlements], "trade": trade.model_dump()}


STEPS = {1: _v1_to_v2, 2: _v2_to_v3}


def migrate_state(raw: dict[str, Any], model: WorldModel) -> tuple[ScenarioState, int]:
    """Returns the state at the current schema and the version it was stored at."""
    stored = int(raw.get("schemaVersion", 1))
    if stored > STATE_SCHEMA_VERSION:
        raise IncompatibleState(f"state schema {stored} is newer than this simulator ({STATE_SCHEMA_VERSION})")
    while int(raw.get("schemaVersion", 1)) < STATE_SCHEMA_VERSION:
        raw = STEPS[int(raw.get("schemaVersion", 1))](raw, model)
    return ScenarioState(**raw), stored
