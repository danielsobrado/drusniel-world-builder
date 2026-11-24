"""Normalize repository lore once. Azgaar identifiers stay separate from canonical identities."""

import math
import random
from typing import Any

from .contracts import CivicIdentity, Identity, Upbringing

NEUTRAL = "unspecified"


def validate_weights(weights: dict[str, float], known: dict, label: str) -> None:
    if not weights or any(key not in known or not 0 <= value <= 1 for key, value in weights.items()):
        raise ValueError(f"{label} must specify known ancestries with weights between zero and one")
    if not math.isclose(sum(weights.values()), 1, abs_tol=1e-6):
        raise ValueError(f"{label} weights must sum to one")


def normalize(catalog: dict, ancestries: dict, profiles: dict, assets: set[str]) -> dict:
    from .decisions import validate_profiles
    from .physiology import validate_ancestries

    validate_ancestries(ancestries)
    definitions = {**catalog["cultures"], **catalog["culturalSeeds"]}
    for key, row in definitions.items():
        if row["id"] != key:
            raise ValueError(f"Culture entry {key} has mismatched id")
        if row["status"] == "core":
            validate_weights(row["ancestryWeights"], ancestries, key)
        elif row["status"] != "seed" or row.get("ancestry") not in ancestries:
            raise ValueError(f"Unknown status or ancestry for culture {key}")
    mapping = {}
    for row in catalog["sourceMappings"]:
        sid, kind, key = row["sourceId"], row["targetType"], row.get("targetKey")
        if type(sid) is not int or sid < 0 or str(sid) in mapping:
            raise ValueError(f"Invalid or duplicate Azgaar culture ID {sid}")
        expected = {"culture": "core", "seed": "seed", "none": None}
        if kind not in expected or (kind == "none" and key is not None) or (kind != "none" and (
                key not in definitions or definitions[key]["status"] != expected[kind]
                or sid not in definitions[key]["azgaarCultureIds"])):
            raise ValueError(f"Invalid Azgaar culture mapping for {sid}")
        mapping[str(sid)] = key
    validate_profiles(profiles, definitions, assets)
    return {"catalogId": catalog["catalogId"], "mapNames": catalog["source"]["mapNames"], "sourceMappings": mapping,
            "cultures": definitions, "ancestries": ancestries, "profiles": profiles, "assignments": {}}


def profile_key(identity: CivicIdentity | Upbringing | None) -> str | None:
    return (identity.cultureId or identity.cultureSeedId) if identity else None


def settlement_identity(record: dict, world: dict, rules: dict) -> tuple[CivicIdentity, dict[str, float]]:
    peoples = rules.get("peoples", {})
    assignment = peoples.get("assignments", {}).get(record["id"])
    definitions = peoples.get("cultures", {})
    source_id = (record.get("cultureId") or "").removeprefix("culture:azgaar:")
    source_name = (world.get("sourceMapName") or "").strip().casefold()
    applies = world.get("mapId") in peoples.get("mappedMapIds", []) and source_name in {
        name.casefold() for name in peoples.get("mapNames", [])
    }
    key = peoples.get("sourceMappings", {}).get(source_id) if applies else None
    explicit = assignment or {}
    if "cultureId" in explicit or "cultureSeedId" in explicit:
        key = explicit.get("cultureId") or explicit.get("cultureSeedId")
    definition = definitions.get(key, {})
    source_weights = definition.get("ancestryWeights")
    if source_weights is None and definition.get("status") == "seed":
        source_weights = {definition["ancestry"]: 1.0}
    weights = explicit.get("ancestryWeights") or source_weights or {NEUTRAL: 1.0}
    identity = CivicIdentity(cultureId=key if definition.get("status") == "core" else None,
                             cultureSeedId=key if definition.get("status") == "seed" else None,
                             polityId=explicit.get("polityId", record.get("stateId")),
                             faithId=explicit.get("faithId", record.get("faithId")))
    return identity, weights


def choose_ancestry(weights: dict[str, float], seed: int, person_id: str) -> str:
    positive = sorted(key for key, value in weights.items() if value > 0)
    if not positive:
        return NEUTRAL
    return random.Random(f"{seed}:{person_id}:ancestry").choices(positive, weights=[weights[key] for key in positive])[0]


def person_identity(ancestry: str, learned: CivicIdentity, home: CivicIdentity, sid: str | None,
                    household: str | None) -> dict[str, Any]:
    return {
        "identity": Identity(ancestryId=ancestry, cultureId=learned.cultureId, cultureSeedId=learned.cultureSeedId,
                             polityId=home.polityId, faithId=learned.faithId),
        "upbringing": Upbringing(cultureId=learned.cultureId, cultureSeedId=learned.cultureSeedId, settlementId=sid,
                                 householdId=household),
    }


def map_matches(saved: dict, world: dict) -> bool:
    return all(saved.get(key) == world.get(key) for key in ("mapId", "sourceFingerprint"))
