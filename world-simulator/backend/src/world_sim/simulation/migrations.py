"""Upgrades saved scenario states to the current schema. Each step is deterministic."""

from typing import Any

from ..world.model import WorldModel
from .contracts import STATE_SCHEMA_VERSION, Cohorts, ScenarioState, Society
from .economy.contracts import SettlementEconomy, Trade
from .economy.roads import initial_roads
from .engine import build_settlements
from .people.generate import initial_cast
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
    settlements = [{**s, "society": initial_society(_record(model, s), Cohorts(**s["cohorts"]), society_cfg,
                                                    model.config.simulation["calendar"]["daysPerMonth"]).model_dump()}
                   for s in raw["settlements"]]
    return {**raw, "schemaVersion": 2, "settlements": settlements}


def _v2_to_v3(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v3 adds the economy (and v4 its roads), read from the imported map as at a baseline, around the saved society."""
    rows = [({k: s[k] for k in ("settlementId", "sourceId", "name", "population", "births", "deaths")}, _record(model, s),
             Cohorts(**s["cohorts"]), Society(**s["society"])) for s in raw["settlements"]]
    settlements, trade = build_settlements(model, rows, model.config.rules, raw["seed"])
    # The economy is built with its roads, so this skips the v3 -> v4 step.
    return {**raw, "schemaVersion": 4, "settlements": [s.model_dump() for s in settlements], "trade": trade.model_dump()}


def _v3_to_v4(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v4 adds roads, bandits and traders around the saved economy, and the markets' Azgaar tax rates."""
    trade = Trade(**raw["trade"])
    members = [(_record(model, s), SettlementEconomy(**{**s["economy"], "settlementClass": _record(model, s)["class"]}))
               for s in raw["settlements"]]
    routes, traders, markets = initial_roads(model, members, trade.markets, raw["seed"], model.config.economy)
    trade = trade.model_copy(update={"routes": routes, "traders": traders, "traderSeq": len(traders), "markets": markets})
    settlements = [{**s, "economy": e.model_dump()} for s, (_, e) in zip(raw["settlements"], members, strict=True)]
    return {**raw, "schemaVersion": 4, "settlements": settlements, "trade": trade.model_dump()}


def _v4_to_v5(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v5 adds the named people, drawn from the saved settlements and traders."""
    state = ScenarioState(**{**raw, "schemaVersion": 5, "cast": {"people": [], "households": [], "names": {}, "seq": {}, "budget": {}}})
    cast = initial_cast(model, state.settlements, state.trade.traders, raw["seed"], model.config.simulation["people"])
    return {**raw, "schemaVersion": 5, "cast": cast.model_dump()}


def _v5_to_v6(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v6 adds the canonical history counter and personal timelines; both start empty (the archive starts here)."""
    return {**raw, "schemaVersion": 6}


STEPS = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4, 4: _v4_to_v5, 5: _v5_to_v6}


def migrate_state(raw: dict[str, Any], model: WorldModel) -> tuple[ScenarioState, int]:
    """Returns the state at the current schema and the version it was stored at."""
    stored = int(raw.get("schemaVersion", 1))
    if stored > STATE_SCHEMA_VERSION:
        raise IncompatibleState(f"state schema {stored} is newer than this simulator ({STATE_SCHEMA_VERSION})")
    while int(raw.get("schemaVersion", 1)) < STATE_SCHEMA_VERSION:
        raw = STEPS[int(raw.get("schemaVersion", 1))](raw, model)
    return ScenarioState(**raw), stored
