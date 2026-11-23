"""Caravan-guard companies: each month a settlement keeps as many as its traders' escorts need."""

import math
from typing import Any

from ..contracts import Business, Society
from .contracts import Route

KIND = "caravan-guard"


def resize_escorts(society: Society, settlement_id: str, source_id: int, name: str, routes: list[Route], cfg: dict[str, Any]) -> Society:
    e = cfg["escorts"]
    wanted = sum(r.guardsWanted for r in routes if r.settlementId == settlement_id)
    count = math.ceil(wanted / e["staff"])
    others = [b for b in society.businesses if b.kind != KIND]
    current = [b for b in society.businesses if b.kind == KIND]
    keep = current[:count]
    for n in range(len(keep) + 1, count + 1):
        keep.append(Business(id=f"business:azgaar-burg:{source_id}:{KIND}:{n}", settlementId=settlement_id, kind=KIND,
                             name=f"{name} {e['label']} {n}", sector="security", profession=e["profession"], staff=e["staff"],
                             wage=e["wage"], filled=0, evidence="Hired to escort caravans on the roads to market"))
    if len(keep) == len(current):
        return society
    return society.model_copy(update={"businesses": others + keep})
