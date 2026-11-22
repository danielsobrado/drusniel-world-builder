"""Deterministic pick of one road-connected settlement per pilot role, or validation of pinned ids."""

import math
from typing import Any

from ..geography.connectivity import shortest_distances

SELECTION_ORDER = [
    "NPC total inside target range",
    "distinct settlement classes",
    "weakest role evidence",
    "shortest summed road distance",
    "source ids",
]


def role_evidence(settlement: dict[str, Any], role: dict[str, Any]) -> list[dict[str, Any]]:
    """Roles are hypotheses: Azgaar records what a burg extracts and crafts, not what its economy is "for"."""
    economy = settlement["economy"]
    evidence: list[dict[str, Any]] = []
    if role.get("marketCenter") and economy["marketCenter"]:
        evidence.append({"kind": "market-center", "detail": f"Azgaar market {economy['marketId']} is centred here", "weight": 3})
        if settlement["port"]:
            evidence.append({"kind": "port", "detail": "Port burg", "weight": 1})
        if settlement["capital"]:
            evidence.append({"kind": "capital", "detail": "State capital", "weight": 1})
    tags = set(role.get("extractedGoodTags") or [])
    for good in economy["extractedGoods"]:
        if tags.intersection(good["tags"]):
            evidence.append({"kind": "extracts", "detail": f"Extracts {good['name']}", "weight": 3})
    crafted = set(role.get("craftedGoods") or [])
    for good in economy["craftedGoods"]:
        if good["name"] in crafted:
            evidence.append({"kind": "crafts", "detail": f"Crafts {good['name']}", "weight": 1})
    return evidence


def _pick(settlement: dict[str, Any], role: dict[str, Any]) -> dict[str, Any]:
    evidence = role_evidence(settlement, role)
    return {"settlement": settlement, "evidence": evidence, "score": sum(e["weight"] for e in evidence)}


def select_pilot(*, audit: dict[str, Any], connectivity: dict[str, Any], budget: dict[str, Any],
                 pilot_config: dict[str, Any]) -> dict[str, Any]:
    roles, constraints = pilot_config["roles"], pilot_config["constraints"]
    npcs_by_id = {a["settlementId"]: a["npcs"] for a in budget["allocations"]}
    graph = connectivity["landGraph"]
    cache: dict[Any, dict[Any, float]] = {}

    def distance(a: dict[str, Any], b: dict[str, Any]) -> float:
        if a["cell"] not in graph or b["cell"] not in graph:
            return math.inf
        if a["cell"] not in cache:
            cache[a["cell"]] = shortest_distances(graph, a["cell"])
        return cache[a["cell"]].get(b["cell"], math.inf)

    target = constraints["npcBudgetTarget"]

    def evaluate(picks: list[dict[str, Any]]) -> dict[str, Any]:
        r, f, t = picks
        pairs = [{"a": a, "b": b, "distancePx": distance(a["settlement"], b["settlement"])} for a, b in ((t, r), (t, f), (r, f))]
        npcs = sum(npcs_by_id.get(p["settlement"]["id"], 0) for p in picks)
        return {
            "picks": picks,
            "pairs": pairs,
            "npcs": npcs,
            "connected": all(math.isfinite(p["distancePx"]) for p in pairs),
            "withinDistance": all(p["distancePx"] <= constraints["maxRouteDistance"] for p in pairs),
            "withinTarget": target["min"] <= npcs <= target["max"],
            "distinctClasses": len({p["settlement"]["class"] for p in picks}),
            "minScore": min(p["score"] for p in picks),
            "totalDistance": sum(p["distancePx"] for p in pairs),
            "ids": tuple(p["settlement"]["sourceId"] for p in picks),
        }

    def rank(triple: dict[str, Any]) -> tuple[Any, ...]:
        return (not triple["withinTarget"], -triple["distinctClasses"], -triple["minScore"], triple["totalDistance"], triple["ids"])

    candidates = [[c for c in (_pick(s, role) for s in audit["settlements"]) if c["evidence"]] for role in roles]
    pinned = pilot_config.get("pinnedSourceIds") or []
    if pinned:
        mode = "pinned"
        if len(pinned) != len(roles):
            raise ValueError("pinnedSourceIds must list one settlement per role")
        by_source = {s["sourceId"]: s for s in audit["settlements"]}
        picks = []
        for source_id, role in zip(pinned, roles, strict=True):
            if source_id not in by_source:
                raise ValueError(f"Pinned pilot settlement {source_id} is not a valid settlement")
            picks.append(_pick(by_source[source_id], role))
        best = evaluate(picks)
    else:
        mode = "search"
        resource, food, trade = candidates
        best = None
        for t in trade:
            for r in resource:
                if r["settlement"] is t["settlement"] or distance(t["settlement"], r["settlement"]) > constraints["maxRouteDistance"]:
                    continue
                for f in food:
                    if f["settlement"] is t["settlement"] or f["settlement"] is r["settlement"]:
                        continue
                    if distance(t["settlement"], f["settlement"]) > constraints["maxRouteDistance"]:
                        continue
                    triple = evaluate([r, f, t])
                    if constraints.get("requireRoadConnection") and not (triple["connected"] and triple["withinDistance"]):
                        continue
                    if best is None or rank(triple) < rank(best):
                        best = triple
        if best is None:
            raise ValueError("No road-connected settlement triple satisfies the pilot roles and maxRouteDistance")

    scale = connectivity["distanceScale"]
    warnings = []
    if not best["connected"]:
        warnings.append("Pilot settlements are not all joined by imported roads or trails.")
    if not best["withinTarget"]:
        warnings.append(f"Pilot holds {best['npcs']} NPCs under the configured target, outside the {target['min']}-{target['max']} aim.")
    for pick, role in zip(best["picks"], roles, strict=True):
        if not pick["evidence"]:
            warnings.append(f"{pick['settlement']['name']} shows no source evidence for the {role['id']} role.")

    def finite(value: float, digits: int) -> float | None:
        return round(value, digits) if math.isfinite(value) else None

    return {
        "mode": mode,
        "roles": [{
            "role": role["id"],
            "roleLabel": role["label"],
            "settlementId": pick["settlement"]["id"],
            "sourceId": pick["settlement"]["sourceId"],
            "name": pick["settlement"]["name"],
            "stateName": pick["settlement"]["stateName"],
            "cultureName": pick["settlement"]["cultureName"],
            "population": pick["settlement"]["population"],
            "class": pick["settlement"]["class"],
            "npcs": npcs_by_id.get(pick["settlement"]["id"], 0),
            "roleStatus": "hypothesis",
            "evidence": [{"kind": e["kind"], "detail": e["detail"]} for e in pick["evidence"]],
        } for pick, role in zip(best["picks"], roles, strict=True)],
        "pairwiseRoutes": [{
            "from": p["a"]["settlement"]["id"],
            "to": p["b"]["settlement"]["id"],
            "distancePx": finite(p["distancePx"], 2),
            "distance": finite(p["distancePx"] * scale, 1),
        } for p in best["pairs"]],
        "distanceUnit": connectivity["distanceUnit"],
        "totalNpcs": best["npcs"],
        "npcBudgetTarget": target,
        "withinNpcTarget": best["withinTarget"],
        "candidateCounts": {role["id"]: len(c) for role, c in zip(roles, candidates, strict=True)},
        "selectionOrder": SELECTION_ORDER,
        "warnings": warnings,
    }
