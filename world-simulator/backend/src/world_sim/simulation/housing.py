"""Abstract housing stock: buildings by type with household capacity. Built once at baseline."""

import math
from typing import Any

from .contracts import HousingStock


def build_housing(households: int, settlement_class: str, cfg: dict[str, Any]) -> list[HousingStock]:
    types, mix = cfg["types"], cfg["mixByClass"][settlement_class]
    capacity_target = math.ceil(households * (1 + cfg["vacancyRate"]))
    stock = []
    for kind in sorted(mix):
        per_building = types[kind]["households"]
        buildings = math.ceil(capacity_target * mix[kind] / per_building)
        stock.append(HousingStock(type=kind, label=types[kind]["label"], buildings=buildings,
                                  capacity=buildings * per_building, occupied=0, vacant=0))
    return stock


def occupy(stock: list[HousingStock], households: int) -> tuple[list[HousingStock], int]:
    """Spread households over types in proportion to capacity; returns the stock and the overcrowded count."""
    total = sum(s.capacity for s in stock)
    housed = min(households, total)
    exact = [housed * s.capacity / total if total else 0 for s in stock]
    occupied = [math.floor(x) for x in exact]
    order = sorted(range(len(stock)), key=lambda i: (-(exact[i] - occupied[i]), stock[i].type))
    for i in order[: housed - sum(occupied)]:
        occupied[i] += 1
    updated = [s.model_copy(update={"occupied": o, "vacant": s.capacity - o}) for s, o in zip(stock, occupied, strict=True)]
    return updated, households - housed
