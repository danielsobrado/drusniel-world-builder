"""Upgrades saved scenario states to the current schema. Each step is deterministic."""

from typing import Any

from ..geography.paths import RoutePlanner, build_routes
from ..ids import settlement_id
from ..peoples.catalog import NEUTRAL, choose_ancestry, map_matches, person_identity, settlement_identity
from ..peoples.contracts import CivicIdentity
from ..peoples.culture import environment, infrastructure
from ..peoples.population import established
from ..world.model import WorldModel
from .contracts import STATE_SCHEMA_VERSION, Cohorts, ScenarioState, SettlementState, Society
from .economy.contracts import SettlementEconomy, Trade
from .economy.roads import initial_roads
from .engine import build_settlements
from .people.generate import initial_cast
from .rules import ready
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
    cast = initial_cast(model, state.settlements, state.trade.traders, raw["seed"], ready(model.config.rules)["simulation"]["people"])
    return {**raw, "schemaVersion": 5, "cast": cast.model_dump()}


def _v5_to_v6(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v6 adds the canonical history counter and personal timelines; both start empty (the archive starts here)."""
    return {**raw, "schemaVersion": 6}


def _v6_to_v7(raw: dict[str, Any], model: WorldModel) -> dict[str, Any]:
    """v7 lets caravans carry news; caravans already on the road carry none."""
    return {**raw, "schemaVersion": 7}


def _v7_to_v8(raw: dict[str, Any], model: WorldModel, rules: dict) -> dict:
    world = model.audit["identity"]
    records = model.settlements_by_id if map_matches(raw["world"], world) else {}
    known = {sid: settlement_identity(record, world, rules) for sid, record in records.items()}
    neutral = CivicIdentity(), {NEUTRAL: 1.0}
    settlements = []
    for row in raw["settlements"]:
        identity, weights = known.get(row["settlementId"], neutral)
        cohorts = established(Cohorts(**row["cohorts"]), weights)
        settlement = SettlementState(**{**row, "identity": identity, "ancestries": cohorts,
                                         "environment": environment(records.get(row["settlementId"], {}))})
        settlements.append(settlement.model_copy(update={"infrastructure": infrastructure(settlement, rules.get("peoples", {}))})
                           .model_dump())
    people = []
    for row in raw["cast"]["people"]:
        source = row["id"].split(":")
        origin = row.get("birthplaceId")
        if not origin and len(source) == 3 and source[1].isdigit():
            origin = settlement_id(int(source[1]))
        learned, weights = known.get(origin, neutral)
        home, _ = known.get(row["settlementId"], neutral)
        identity = person_identity(choose_ancestry(weights, raw["seed"], row["id"]), learned, home, origin, row["householdId"])
        people.append({**row, **{key: value.model_dump() for key, value in identity.items()}})
    return {**raw, "schemaVersion": 8, "settlements": settlements, "cast": {**raw["cast"], "people": people}}


def _v8_to_v9(raw: dict, model: WorldModel, rules: dict) -> dict:
    if not map_matches(raw["world"], model.audit["identity"]):
        return {**raw, "schemaVersion": 9}
    settlements = {row["settlementId"]: row for row in raw["settlements"]}
    travel = build_routes(model, list(settlements), rules["simulation"]["travel"])
    markets = {m["marketId"]: m["centerSettlementId"] for m in raw["trade"]["markets"]}
    planner = RoutePlanner(model, {**rules["simulation"]["travel"], **rules["economy"]["caravans"]})
    roads = []
    for road in raw["trade"].get("routes", []):
        origin = model.settlements_by_id.get(road["settlementId"])
        destination = model.settlements_by_id.get(markets.get(road["marketId"]))
        path = planner.route(origin, destination, off_road=True) if origin and destination else None
        if path:
            road = {**road, "path": path.model_dump(), "days": path.days, "mode": "sea" if path.mode in ("sea", "mixed") else "land"}
            row = settlements[road["settlementId"]]
            settlements[road["settlementId"]] = {**row, "economy": {**row["economy"], "travelDays": path.days}}
        roads.append(road)
    return {**raw, "schemaVersion": 9, "travel": {"routes": [r.model_dump() for r in travel]},
            "trade": {**raw["trade"], "routes": roads}, "settlements": list(settlements.values())}


STEPS = {1: _v1_to_v2, 2: _v2_to_v3, 3: _v3_to_v4, 4: _v4_to_v5, 5: _v5_to_v6, 6: _v6_to_v7}


def migrate_state(raw: dict[str, Any], model: WorldModel, rules: dict | None = None) -> tuple[ScenarioState, int]:
    """Returns the state at the current schema and the version it was stored at."""
    stored = int(raw.get("schemaVersion", 1))
    if stored > STATE_SCHEMA_VERSION:
        raise IncompatibleState(f"state schema {stored} is newer than this simulator ({STATE_SCHEMA_VERSION})")
    while int(raw.get("schemaVersion", 1)) < STATE_SCHEMA_VERSION:
        version = int(raw.get("schemaVersion", 1))
        if version == 7:
            raw = _v7_to_v8(raw, model, rules or model.config.rules)
        elif version == 8:
            raw = _v8_to_v9(raw, model, rules or model.config.rules)
        else:
            raw = STEPS[version](raw, model)
    return ScenarioState(**raw), stored
