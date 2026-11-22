"""
Deterministic persistent-NPC allocation:
  1. every eligible settlement gets its class minimum;
  2. the remaining slots are shared by weight = sqrt(population) * importance;
  3. shares that would pass a class maximum are capped and the rest re-shared;
  4. integer remainders go to the largest fractions, ties by source id.
Targets below the summed minimums or above the summed maximums are reported as
infeasible; the allocation then stops at the bound, never past a cap.
"""

import math
from typing import Any

EPSILON = 1e-9


def importance_multiplier(settlement: dict[str, Any], importance: dict[str, float]) -> float:
    multiplier = 1.0
    if settlement.get("capital"):
        multiplier *= importance.get("capital", 1)
    if settlement.get("port"):
        multiplier *= importance.get("port", 1)
    if (settlement.get("economy") or {}).get("marketCenter"):
        multiplier *= importance.get("marketCenter", 1)
    return multiplier


def _distribute(entries: list[dict[str, Any]], slots: int) -> dict[int, int]:
    share = {e["sourceId"]: 0.0 for e in entries}
    open_ = [e for e in entries if e["max"] > e["min"] and e["weight"] > 0]
    remaining = float(slots)
    while remaining > 0 and open_:
        total = sum(e["weight"] for e in open_)
        capped = [e for e in open_ if e["min"] + remaining * e["weight"] / total >= e["max"]]
        if not capped:
            for e in open_:
                share[e["sourceId"]] = remaining * e["weight"] / total
            break
        for e in capped:
            share[e["sourceId"]] = e["max"] - e["min"]
            remaining -= e["max"] - e["min"]
        open_ = [e for e in open_ if e not in capped]
    counts = {e["sourceId"]: e["min"] + math.floor(share[e["sourceId"]] + EPSILON) for e in entries}
    leftover = slots - sum(counts[e["sourceId"]] - e["min"] for e in entries)
    by_fraction = sorted(
        (e for e in entries if counts[e["sourceId"]] < e["max"]),
        key=lambda e: (-(share[e["sourceId"]] - math.floor(share[e["sourceId"]] + EPSILON)), e["sourceId"]),
    )
    for e in by_fraction:
        if leftover <= 0:
            break
        counts[e["sourceId"]] += 1
        leftover -= 1
    return counts


def allocate_npc_budget(settlements: list[dict[str, Any]], *, target: int, ranges: dict[str, dict[str, int]],
                        importance: dict[str, float] | None = None, minimumEligiblePopulation: int = 1,  # noqa: N803
                        **_: Any) -> dict[str, Any]:
    importance = importance or {}
    eligible = [s for s in settlements if s["population"] >= minimumEligiblePopulation]
    entries = []
    for s in eligible:
        r = ranges.get(s["class"])
        if not r:
            raise ValueError(f"No NPC range configured for settlement class {s['class']}")
        weight = math.sqrt(s["population"]) * importance_multiplier(s, importance)
        entries.append({"sourceId": s["sourceId"], "id": s["id"], "min": r["min"], "max": r["max"], "weight": weight})
    entries.sort(key=lambda e: e["sourceId"])
    minimum_total = sum(e["min"] for e in entries)
    maximum_total = sum(e["max"] for e in entries)

    feasible, reason = True, None
    if target < minimum_total:
        feasible = False
        reason = (f"Target {target} is below the {minimum_total} NPCs that class minimums require across "
                  f"{len(entries)} settlements; allocation holds every settlement at its minimum.")
        counts = {e["sourceId"]: e["min"] for e in entries}
    elif target > maximum_total:
        feasible = False
        reason = (f"Target {target} exceeds the {maximum_total} NPCs that class maximums allow; allocation stops "
                  f"at every cap, {target - maximum_total} slots unassigned.")
        counts = {e["sourceId"]: e["max"] for e in entries}
    else:
        counts = _distribute(entries, target - minimum_total)

    allocations = [{"settlementId": e["id"], "sourceId": e["sourceId"], "npcs": counts[e["sourceId"]],
                    "min": e["min"], "max": e["max"], "weight": round(e["weight"], 4)} for e in entries]
    allocated = sum(a["npcs"] for a in allocations)
    for a in allocations:
        if not a["min"] <= a["npcs"] <= a["max"]:
            raise AssertionError(f"NPC allocation broke the range of settlement {a['sourceId']}")
    if feasible and allocated != target:
        raise AssertionError(f"NPC allocation summed to {allocated}, expected {target}")
    return {
        "target": target,
        "allocated": allocated,
        "difference": allocated - target,
        "feasible": feasible,
        "reason": reason,
        "minimumTotal": minimum_total,
        "maximumTotal": maximum_total,
        "eligibleSettlements": len(entries),
        "ineligibleSettlements": len(settlements) - len(entries),
        "settlementsAtMaximum": sum(a["npcs"] == a["max"] for a in allocations),
        "settlementsAtMinimum": sum(a["npcs"] == a["min"] for a in allocations),
        "allocations": allocations,
    }


def group_allocation(budget: dict[str, Any], settlements: list[dict[str, Any]], field: str) -> list[dict[str, Any]]:
    """Allocation totals grouped by a settlement field (class, stateName...)."""
    by_id = {s["id"]: s for s in settlements}
    groups: dict[str, dict[str, Any]] = {}
    for a in budget["allocations"]:
        settlement = by_id[a["settlementId"]]
        key = settlement.get(field) or "none"
        group = groups.setdefault(key, {"key": key, "settlements": 0, "npcs": 0, "population": 0})
        group["settlements"] += 1
        group["npcs"] += a["npcs"]
        group["population"] += settlement["population"]
    return [groups[k] for k in sorted(groups, key=lambda k: (k.casefold(), k))]
