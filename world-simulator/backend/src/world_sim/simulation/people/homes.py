"""
Dwellings for named households, materialised from the settlement's aggregate housing
stock on demand: `building:<sourceId>:<type>:<n>` with n never above the stock's
buildings of that type, and never more households in one than the type holds.
"""

import random
from typing import Any

from ..contracts import SettlementState
from .contracts import Dwelling, NpcHousehold


def per_building(stock: Any) -> int:
    return max(1, stock.capacity // stock.buildings) if stock.buildings else 1


def place(dwellings: list[Dwelling], s: SettlementState, household_id: str, rng: random.Random) -> Dwelling:
    """Moves a household into a dwelling with room, materialising one if needed; returns the updated dwelling (already in the list)."""
    stock = [h for h in s.society.housing if h.buildings]
    if not stock:
        raise AssertionError(f"{s.name} has no housing to place a household in")
    ranked = rng.choices(stock, weights=[max(1, h.occupied) for h in stock], k=len(stock) * 2) + stock
    for h in ranked:
        mine = [d for d in dwellings if d.settlementId == s.settlementId and d.type == h.type]
        roomy = next((d for d in mine if len(d.households) < d.capacity), None)
        if roomy is not None:
            moved = roomy.model_copy(update={"households": [*roomy.households, household_id]})
            dwellings[dwellings.index(roomy)] = moved
            return moved
        if len(mine) < h.buildings:
            new = Dwelling(id=f"building:{s.sourceId}:{h.type}:{len(mine) + 1}", settlementId=s.settlementId, type=h.type,
                           capacity=per_building(h), households=[household_id])
            dwellings.append(new)
            return new
    raise AssertionError(f"{s.name} has no dwelling with room left")


def leave(dwellings: list[Dwelling], household: NpcHousehold) -> None:
    for i, d in enumerate(dwellings):
        if household.id in d.households:
            dwellings[i] = d.model_copy(update={"households": [x for x in d.households if x != household.id]})
