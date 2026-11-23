"""
Business entities against physical premises. A farm or mine works outside the town; a
baker or tailor works from the family home; a market stall shares a market hall with
others; a smithy or merchant house has its own building. The
assignment is derived from the business list, so it needs no stored state.
"""

import math
from collections import defaultdict
from typing import Any

from .contracts import SettlementState


def premises(s: SettlementState, cfg: dict[str, Any]) -> dict[str, str | None]:
    """Business id -> premises id: None for rural operations, `home:` for trades worked from a dwelling."""
    shared = cfg["shared"]
    seen: dict[str, int] = defaultdict(int)
    out: dict[str, str | None] = {}
    for b in sorted(s.society.businesses, key=lambda b: b.id):
        if b.kind in cfg["rural"]:
            out[b.id] = None
            continue
        if b.kind in cfg["homeBased"]:
            out[b.id] = f"home:{b.id}"
            continue
        per = shared.get(b.kind, {}).get("per", 1)
        seen[b.kind] += 1
        out[b.id] = f"premises:{s.sourceId}:{b.kind}:{math.ceil(seen[b.kind] / per)}"
    return out


def diagnostics(s: SettlementState, cfg: dict[str, Any]) -> dict[str, Any]:
    """Plausibility ratios for one settlement, with the ones outside their configured range flagged."""
    places = premises(s, cfg)
    businesses = len(s.society.businesses)
    workers = sum(b.filled for b in s.society.businesses)
    urban = len({p for p in places.values() if p and p.startswith("premises:")})
    dwellings = sum(h.buildings for h in s.society.housing)
    ratios = {
        "businesses": businesses,
        "ruralOperations": sum(1 for p in places.values() if p is None),
        "homeWorkshops": sum(1 for p in places.values() if p and p.startswith("home:")),
        "urbanPremises": urban,
        "dwellingBuildings": dwellings,
        "employeesPerBusiness": round(workers / businesses, 2) if businesses else 0.0,
        "businessesPerThousand": round(businesses / s.population * 1000, 1) if s.population else 0.0,
        "urbanPremisesPerDwelling": round(urban / dwellings, 3) if dwellings else 0.0,
    }
    flags = []
    if ratios["employeesPerBusiness"] < cfg["minEmployeesPerBusiness"]:
        flags.append(f"few workers per business ({ratios['employeesPerBusiness']})")
    if ratios["businessesPerThousand"] > cfg["maxBusinessesPerThousand"]:
        flags.append(f"many businesses for the population ({ratios['businessesPerThousand']} per 1,000)")
    if ratios["urbanPremisesPerDwelling"] > cfg["maxUrbanPremisesPerDwelling"]:
        flags.append(f"urban premises crowd the housing ({ratios['urbanPremisesPerDwelling']} per dwelling building)")
    return {"settlementId": s.settlementId, "name": s.name, **ratios, "flags": flags}
