"""Deterministic utility for comparable opportunities with an explicit score breakdown."""

import math
from dataclasses import dataclass, field

from .catalog import profile_key
from .contracts import CivicIdentity, Upbringing

MOTIVES = {"autonomy", "continuity", "apprenticeship", "durability", "loyalty", "stewardship", "discretion"}
DEMAND = {"trade", "housing", "industry", "mining", "woodland", "civic"}


@dataclass(frozen=True)
class Opportunity:
    id: str
    income: float
    risk: float
    motives: dict[str, float] = field(default_factory=dict)
    relationship: float = 0.0


def validate_profiles(profiles: dict, cultures: dict, assets: set[str]) -> None:
    for key, profile in profiles.items():
        if key not in cultures:
            raise ValueError(f"Unknown culture or seed in behavior profile {key}")
        if any(m not in MOTIVES or not math.isfinite(value) or not 0 <= value <= 1
               for m, value in profile.get("preferences", {}).items()):
            raise ValueError(f"Invalid preference in behavior profile {key}")
        seen = set()
        for item in profile.get("institutions", []):
            if (item["id"] in seen or item["assetId"] not in assets or item["demand"] not in DEMAND
                    or item.get("environment") not in (None, "wetland")):
                raise ValueError(f"Invalid institution {item['id']} in {key}")
            seen.add(item["id"])


def preferences(identity: CivicIdentity, upbringing: Upbringing, local: CivicIdentity | None, profiles: dict) -> dict[str, float]:
    layers = ((profile_key(identity), 0.25), (profile_key(upbringing), 0.55), (profile_key(local), 0.20))
    result: dict[str, float] = {}
    for key, weight in layers:
        for name, value in profiles.get(key, {}).get("preferences", {}).items():
            result[name] = result.get(name, 0.0) + weight * value
    return result


def rank(options: list[Opportunity], weights: dict[str, float], *, greed: float = 0.5, caution: float = 0.5,
         trust: float = 0.5, urgency: float = 0.0, variation: float = 1.0) -> list[dict]:
    rows = []
    for option in options:
        parts = {"income": option.income * (0.75 + greed + 2 * urgency),
                 "risk": -option.risk * (0.5 + caution), "relationships": option.relationship * trust,
                 "culture": sum(weights.get(m, 0.0) * value for m, value in option.motives.items()) * variation}
        rows.append({"id": option.id, "score": round(sum(parts.values()), 5),
                     "contributions": {key: round(value, 5) for key, value in parts.items()}})
    return sorted(rows, key=lambda row: (-row["score"], row["id"]))


SCENARIOS = {
    "trade": [
        Opportunity("diversify-partners", 0.53, 0.15, {"autonomy": 1.0, "stewardship": 0.3}),
        Opportunity("exclusive-patron", 0.89, 0.38, {"loyalty": 1.0, "continuity": 0.3}, 0.1),
        Opportunity("guild-contract", 0.55, 0.16, {"apprenticeship": 0.6, "durability": 0.8, "continuity": 0.4}),
    ],
    "shortage": [
        Opportunity("release-reserves", 0.18, 0.25, {"loyalty": 0.7}),
        Opportunity("ration-and-replant", 0.15, 0.23, {"stewardship": 1.0, "continuity": 0.6}),
        Opportunity("source-food-from-new-partners", 0.27, 0.32, {"autonomy": 0.8}),
    ],
    "migration": [
        Opportunity("move-for-work", 0.72, 0.35, {"autonomy": 0.5}),
        Opportunity("stay-with-household", 0.38, 0.13, {"loyalty": 0.9, "continuity": 0.8}, 0.3),
    ],
    "housing": [
        Opportunity("build-quickly", 0.70, 0.22, {"autonomy": 0.2}),
        Opportunity("maintain-existing-homes", 0.40, 0.14, {"stewardship": 0.8, "durability": 0.9, "continuity": 0.5}),
    ],
    "dispute": [
        Opportunity("open-mediation", 0.43, 0.15, {"autonomy": 0.3}),
        Opportunity("institutional-arbitration", 0.41, 0.18, {"loyalty": 0.8, "discretion": 0.7, "durability": 0.2}, 0.1),
    ],
    "information": [
        Opportunity("share-openly", 0.45, 0.12, {"autonomy": 0.45, "stewardship": 0.3}),
        Opportunity("ask-house-before-sharing", 0.35, 0.10, {"discretion": 1.0, "loyalty": 0.6}, 0.1),
    ],
}
