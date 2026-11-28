"""The read-only world every API request and CLI run shares; built once per process."""

from dataclasses import dataclass
from typing import Any

from ..config import Config
from ..geography.connectivity import build_settlement_connectivity
from ..npc.budget import allocate_npc_budget, group_allocation
from ..pilot.selector import select_pilot
from .audit import build_world_audit
from .loader import load_azgaar_world


@dataclass(frozen=True)
class WorldModel:
    config: Config
    audit: dict[str, Any]
    document: dict[str, Any]
    connectivity: dict[str, Any]
    budget: dict[str, Any]
    scenarios: list[dict[str, Any]]
    pilot: dict[str, Any]
    settlements_by_id: dict[str, dict[str, Any]]
    connectivity_by_id: dict[str, dict[str, Any]]
    npcs_by_id: dict[str, int]
    pilot_ids: frozenset[str]
    renamed_from: dict[str, str] | None = None


def _budget_for(audit: dict[str, Any], npc: dict[str, Any], target: int) -> dict[str, Any]:
    budget = allocate_npc_budget(audit["settlements"], **{**npc, "target": target})
    return {
        **budget,
        "byClass": group_allocation(budget, audit["settlements"], "class"),
        "byState": group_allocation(budget, audit["settlements"], "stateName"),
    }


def build_world_model(config: Config) -> WorldModel:
    world = config.simulator["world"]
    source = load_azgaar_world(
        config.root / world["manifest"], config.root / world["mapsDirectory"], world["mapId"],
    )
    audit = build_world_audit(source, config.simulator)
    connectivity = build_settlement_connectivity(audit, source["document"]["pack"].get("routes"), config.simulator["connectivity"])
    budget = _budget_for(audit, config.npc, config.npc["target"])
    scenarios = [budget if t == config.npc["target"] else _budget_for(audit, config.npc, t)
                 for t in sorted(set(config.npc["comparisonScenarios"]))]
    pilot = select_pilot(audit=audit, connectivity=connectivity, budget=budget, pilot_config=config.pilot)
    return WorldModel(
        config=config,
        audit=audit,
        document=source["document"],
        connectivity=connectivity,
        budget=budget,
        scenarios=scenarios,
        pilot=pilot,
        settlements_by_id={s["id"]: s for s in audit["settlements"]},
        connectivity_by_id={c["settlementId"]: c for c in connectivity["settlements"]},
        npcs_by_id={a["settlementId"]: a["npcs"] for a in budget["allocations"]},
        pilot_ids=frozenset(r["settlementId"] for r in pilot["roles"]),
        renamed_from=source["renamedFrom"],
    )
