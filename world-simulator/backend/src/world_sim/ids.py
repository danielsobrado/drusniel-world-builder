"""Stable ids shared with the game's sim projection (src/sim/model/ids.js); keep the prefixes identical."""


def settlement_id(source_id: int) -> str:
    return f"settlement:azgaar-burg:{source_id}"


def state_id(source_id: int) -> str:
    return f"region:azgaar-state:{source_id}"


def province_id(source_id: int) -> str:
    return f"region:azgaar-province:{source_id}"


def culture_id(source_id: int) -> str:
    return f"culture:azgaar:{source_id}"
