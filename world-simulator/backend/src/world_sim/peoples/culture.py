"""Translate local institutions into demand for assets already in the game registry."""

from typing import TYPE_CHECKING

from .catalog import profile_key
from .contracts import Infrastructure

if TYPE_CHECKING:
    from ..simulation.contracts import SettlementState


def environment(record: dict) -> str | None:
    biome = record.get("geography", {}).get("biome")
    return "wetland" if biome in {"Wetland", "Wetlands"} else biome


def infrastructure(settlement: "SettlementState", rules: dict) -> list[Infrastructure]:
    profile = rules.get("profiles", {}).get(profile_key(settlement.identity), {})
    society, economy = settlement.society, settlement.economy
    demand = {
        "trade": int(economy.tradeBalance != 0) + int(economy.marketId is not None),
        "housing": society.overcrowdedHouseholds + sum(h.buildings for h in society.housing),
        "industry": sum(b.filled > 0 for b in society.businesses if b.sector == "crafts"),
        "mining": sum(b.filled > 0 for b in society.businesses if b.kind == "mine"),
        "woodland": sum(b.filled > 0 for b in society.businesses if b.kind == "woodcutter"),
        "civic": sum(b.filled > 0 for b in society.businesses if b.kind in {"garrison", "watch-post", "temple"}),
    }
    return [Infrastructure(institutionId=item["id"], assetId=item["assetId"], demand=demand[item["demand"]])
            for item in profile.get("institutions", []) if item.get("environment") in (None, settlement.environment)]
