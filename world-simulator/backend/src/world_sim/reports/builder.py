"""Report and API payloads built from the world model; the CLI and the API share these."""

from importlib.metadata import version
from typing import Any

from ..canonical import checksum
from ..config import Config
from ..world.model import WorldModel

REPORT_SCHEMA_VERSION = 1
GENERATOR = {"name": "drusniel-world-simulator", "version": version("world-sim")}


def world_identity(model: WorldModel) -> dict[str, Any]:
    identity = model.audit["identity"]
    return {k: identity[k] for k in ("mapId", "name", "fileName", "format", "azgaarVersion", "seed", "sourceFingerprint")}


def config_fingerprint(config: Config) -> str:
    return checksum({
        "classification": config.simulator["classification"],
        "connectivity": config.simulator["connectivity"],
        "npc": config.npc,
        "pilot": config.pilot,
    })


def _meta(model: WorldModel, artifact: str) -> dict[str, Any]:
    return {
        "artifact": artifact,
        "schemaVersion": REPORT_SCHEMA_VERSION,
        "generator": GENERATOR,
        "world": world_identity(model),
        "configFingerprint": config_fingerprint(model.config),
    }


def budget_totals(b: dict[str, Any]) -> dict[str, Any]:
    keys = ("target", "allocated", "difference", "feasible", "reason", "minimumTotal", "maximumTotal",
            "eligibleSettlements", "ineligibleSettlements", "settlementsAtMinimum", "settlementsAtMaximum")
    total = b["eligibleSettlements"] + b["ineligibleSettlements"]
    return {**{k: b[k] for k in keys}, "coverage": b["eligibleSettlements"] / total if total else 0}


def build_summary(model: WorldModel) -> dict[str, Any]:
    audit = model.audit
    settlements = audit["settlements"]
    return {
        "world": world_identity(model),
        "sourceSettings": audit["sourceSettings"],
        "mapSize": audit["mapSize"],
        "counts": audit["counts"],
        "referenceCheck": audit["referenceCheck"],
        "population": audit["population"],
        "populationInterpretation": audit["populationInterpretation"],
        "classes": [{"id": c["id"], "label": c["label"], "maxPopulation": c.get("maxPopulation")}
                    for c in model.config.simulator["classification"]],
        "classDistribution": audit["classDistribution"],
        "states": audit["states"],
        "cultures": audit["cultures"],
        "provinceCount": len(audit["provinces"]),
        "invalidRecords": audit["invalidRecords"],
        "removedCount": audit["removedCount"],
        "capitals": sum(s["capital"] for s in settlements),
        "ports": sum(s["port"] for s in settlements),
        "npcBudget": budget_totals(model.budget),
        "connectivity": model.connectivity["summary"],
        "pilotSettlementIds": [r["settlementId"] for r in model.pilot["roles"]],
    }


def settlement_row(model: WorldModel, settlement: dict[str, Any]) -> dict[str, Any]:
    """A settlement with its computed NPC count and pilot flag."""
    return {**settlement, "npcs": model.npcs_by_id.get(settlement["id"], 0), "pilot": settlement["id"] in model.pilot_ids}


def settlement_detail(model: WorldModel, settlement: dict[str, Any]) -> dict[str, Any]:
    c = model.connectivity_by_id[settlement["id"]]

    def named(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [{**i, "name": model.settlements_by_id[i["settlementId"]]["name"]} for i in items]

    allocation = next((a for a in model.budget["allocations"] if a["settlementId"] == settlement["id"]), None)
    return {
        **settlement_row(model, settlement),
        "npcAllocation": allocation,
        "connectivity": {
            **c,
            "distanceUnit": model.connectivity["distanceUnit"],
            "distanceScale": model.connectivity["distanceScale"],
            "roadLinks": named(c["roadLinks"]),
            "seaLinks": named(c["seaLinks"]),
            "nearby": named(c["nearby"]),
        },
    }


def build_connectivity_report(model: WorldModel, include_settlements: bool = True) -> dict[str, Any]:
    c = model.connectivity
    report = {k: c[k] for k in ("distanceUnit", "distanceScale", "summary", "components", "unresolvedRoutes", "routes")}
    if include_settlements:
        report["settlements"] = c["settlements"]
    return report


def build_budget_comparison(model: WorldModel) -> dict[str, Any]:
    npc = model.config.npc
    return {
        "configuredTarget": npc["target"],
        "ranges": npc["ranges"],
        "importance": npc["importance"],
        "minimumEligiblePopulation": npc["minimumEligiblePopulation"],
        "scenarios": [{**budget_totals(b), "byClass": b["byClass"], "byState": b["byState"]} for b in model.scenarios],
    }


def build_reports(model: WorldModel) -> dict[str, dict[str, Any]]:
    return {
        "world-summary.json": {"meta": _meta(model, "world-summary"), "data": build_summary(model)},
        "settlements.json": {"meta": _meta(model, "settlements"),
                             "data": [settlement_row(model, s) for s in model.audit["settlements"]]},
        "connectivity.json": {"meta": _meta(model, "connectivity"), "data": build_connectivity_report(model)},
        "npc-budget-comparison.json": {"meta": _meta(model, "npc-budget-comparison"), "data": build_budget_comparison(model)},
        "pilot-settlements.json": {"meta": _meta(model, "pilot-settlements"), "data": model.pilot},
    }
