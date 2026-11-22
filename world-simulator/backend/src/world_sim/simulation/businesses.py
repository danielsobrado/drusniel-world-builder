"""
Businesses sized from the baseline labour force and the settlement's Azgaar evidence.
Evidence kinds (mines, workshops for crafted goods...) exist only where the map records
the good; a sector with no possible business hands its labour share to agriculture.
"""

import re
from typing import Any

from .contracts import Business

SECTORS = ("agriculture", "extraction", "crafts", "trade", "services", "security")


def _requirement_met(requires: str | None, settlement: dict[str, Any]) -> bool:
    if requires is None:
        return True
    if requires == "marketCenter":
        return settlement["economy"]["marketCenter"]
    if requires == "walls":
        return bool({"walls", "citadel"} & set(settlement["civicFeatures"]))
    return requires in settlement["civicFeatures"]


def _evidence_goods(evidence: dict[str, Any], settlement: dict[str, Any]) -> list[str]:
    economy = settlement["economy"]
    if evidence.get("crafted") == "any":
        return [g["name"] for g in economy["craftedGoods"]]
    names = set(evidence.get("extracted") or [])
    tags = set(evidence.get("extractedTags") or [])
    return [g["name"] for g in economy["extractedGoods"] if g["name"] in names or tags & set(g["tags"])]


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def candidate_kinds(settlement: dict[str, Any], cfg: dict[str, Any]) -> list[dict[str, Any]]:
    """Business kinds this settlement can host, one entry per evidenced good."""
    out = []
    for kind, t in cfg["businesses"].items():
        if not _requirement_met(t.get("requires"), settlement):
            continue
        if t.get("evidence"):
            for good in _evidence_goods(t["evidence"], settlement):
                label = f"{good} workshop" if kind == "workshop" else t["label"]
                out.append({**t, "kind": kind, "good": good, "label": label, "weight": cfg["evidenceWeight"],
                            "evidence": f"Azgaar records {'crafting' if kind == 'workshop' else 'extraction of'} {good}"})
        else:
            reason = f"Azgaar civic feature: {t['requires']}" if t.get("requires") else None
            out.append({**t, "kind": kind, "good": None, "weight": 1, "evidence": reason})
    return out


def generate_businesses(settlement: dict[str, Any], labour_supply: int, cfg: dict[str, Any]) -> list[Business]:
    shares = dict(cfg["labour"]["sectorShareByClass"][settlement["class"]])
    kinds = candidate_kinds(settlement, cfg)
    for sector in SECTORS:
        if sector != "agriculture" and not any(k["sector"] == sector for k in kinds):
            shares["agriculture"] += shares.pop(sector, 0)
    out: list[Business] = []
    for sector in SECTORS:
        sector_kinds = [k for k in kinds if k["sector"] == sector]
        weight = sum(k["weight"] for k in sector_kinds)
        for k in sector_kinds:
            labour = labour_supply * shares.get(sector, 0) * k["weight"] / weight
            # Evidence and civic requirements guarantee at least one; generic kinds may round to none.
            count = max(1 if (k["good"] or k.get("requires")) else 0, round(labour / k["staff"]))
            key = f"{k['kind']}-{_slug(k['good'])}" if k["good"] else k["kind"]
            for n in range(1, count + 1):
                out.append(Business(
                    id=f"business:azgaar-burg:{settlement['sourceId']}:{key}:{n}",
                    settlementId=settlement["id"],
                    kind=k["kind"],
                    name=f"{settlement['name']} {k['label']}" + (f" {n}" if count > 1 else ""),
                    sector=sector,
                    profession=k["profession"],
                    good=k["good"],
                    staff=k["staff"],
                    wage=k["wage"],
                    filled=0,
                    evidence=k["evidence"],
                ))
    return out
