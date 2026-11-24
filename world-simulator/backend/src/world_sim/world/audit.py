"""Immutable world facts and normalized population; the source document is only read."""

import math
from typing import Any

from ..ids import culture_id, province_id, settlement_id, state_id
from .classifier import class_distribution, classify_settlement
from .population import burg_inhabitants, interpretation_notes, js_round, population_scale, rural_inhabitants

CIVIC_FEATURES = ("citadel", "walls", "plaza", "temple", "shanty", "port")


def _num(value: Any) -> float | None:
    if isinstance(value, bool):
        return float(value)
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    return n if math.isfinite(n) else None


def _active(records: list[Any]) -> list[dict[str, Any]]:
    return [r for r in records if isinstance(r, dict) and (_num(r.get("i")) or 0) > 0 and not r.get("removed")]


def _invalid_reason(burg: dict[str, Any], cell_count: int) -> str | None:
    if not isinstance(burg.get("name"), str) or not burg["name"].strip():
        return "missing name"
    if _num(burg.get("x")) is None or _num(burg.get("y")) is None or isinstance(burg.get("x"), str):
        return "non-finite coordinates"
    pop = _num(burg.get("population"))
    if pop is None or pop < 0:
        return "invalid population"
    cell = burg.get("cell")
    if not isinstance(cell, int) or isinstance(cell, bool) or not 0 <= cell < cell_count:
        return "cell out of range"
    return None


def _goods_evidence(burg: dict[str, Any], goods_by_id: dict[int, dict[str, Any]]) -> dict[str, Any]:
    extracted: dict[str, dict[str, Any]] = {}
    crafted: dict[str, dict[str, Any]] = {}
    for entry in burg.get("production") or []:
        good = goods_by_id.get(entry.get("goodId")) if isinstance(entry, dict) else None
        if not good:
            continue
        target = crafted if entry.get("recipe") else extracted
        target[good["name"]] = {"name": good["name"], "tags": sorted(good.get("tags") or [])}
    ordered = lambda d: [d[k] for k in sorted(d, key=lambda n: (n.casefold(), n))]  # noqa: E731
    return {"extractedGoods": ordered(extracted), "craftedGoods": ordered(crafted)}


def _settlement_record(burg: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    cell = ctx["cells"][burg["cell"]]
    state = ctx["states"].get(burg.get("state"))
    province = ctx["provinces"].get(cell.get("province"))
    culture = ctx["cultures"].get(burg.get("culture"))
    population = burg_inhabitants(burg["population"], ctx["scale"])
    civic = {key: (_num(burg.get(key)) or 0) > 0 for key in CIVIC_FEATURES}
    market = ctx["markets_by_center"].get(burg["i"])
    biome_names = ctx["biome_names"]
    biome = cell.get("biome")
    return {
        "id": settlement_id(burg["i"]),
        "sourceId": burg["i"],
        "name": burg["name"].strip(),
        "x": burg["x"],
        "y": burg["y"],
        "cell": burg["cell"],
        "stateId": state_id(state["i"]) if state else None,
        "stateName": state["name"] if state else "Neutral lands",
        "provinceId": province_id(province["i"]) if province else None,
        "provinceName": province["name"] if province else None,
        "cultureId": culture_id(culture["i"]) if culture else None,
        "cultureName": culture["name"] if culture else None,
        "faithId": f"faith:azgaar:{religion}" if type(religion := burg.get("religion", cell.get("religion"))) is int
        and religion > 0 else None,
        "capital": (_num(burg.get("capital")) or 0) > 0,
        "port": civic["port"],
        "population": population,
        "populationPoints": float(burg["population"]),
        "class": classify_settlement(population, ctx["classes"])["id"],
        "azgaarType": burg.get("type"),
        "azgaarGroup": burg.get("group"),
        "civicFeatures": [k for k in CIVIC_FEATURES if civic[k]],
        "geography": {
            "biome": biome_names[biome] if isinstance(biome, int) and 0 <= biome < len(biome_names) else None,
            "heightIndex": cell.get("h"),
            "coastal": cell.get("t") == 1,
            "riverCell": (_num(cell.get("r")) or 0) > 0,
            "feature": cell.get("f"),
        },
        "economy": {
            **_goods_evidence(burg, ctx["goods_by_id"]),
            "marketCenter": market is not None,
            "marketId": market["i"] if market else None,
        },
    }


def _region_summaries(records: list[dict[str, Any]], key: str, settlements: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out = []
    for record in records:
        members = [s for s in settlements if s[key] == record["id"]]
        out.append({**record, "settlementCount": len(members), "settlementPopulation": sum(s["population"] for s in members)})
    return out


def build_world_audit(source: dict[str, Any], simulator_config: dict[str, Any]) -> dict[str, Any]:
    identity, document = source["identity"], source["document"]
    pack, settings = document["pack"], document["settings"]
    scale = population_scale(settings)
    classes = simulator_config["classification"]
    ctx = {
        "scale": scale,
        "classes": classes,
        "cells": pack["cells"],
        "states": {s["i"]: s for s in sorted(_active(pack["states"]), key=lambda r: r["i"])},
        "provinces": {p["i"]: p for p in sorted(_active(pack["provinces"]), key=lambda r: r["i"])},
        "cultures": {c["i"]: c for c in sorted(
            (c for c in pack["cultures"] if isinstance(c, dict) and not c.get("removed")), key=lambda r: r["i"])},
        "goods_by_id": {g["i"]: g for g in pack.get("goods") or [] if isinstance(g, dict)},
        "markets_by_center": {m["centerBurgId"]: m for m in pack.get("markets") or []
                              if isinstance(m, dict) and (m.get("centerBurgId") or 0) > 0},
        "biome_names": (document.get("biomesData") or {}).get("name") or [],
    }

    invalid_records: list[dict[str, Any]] = []
    removed_count = 0
    settlements: list[dict[str, Any]] = []
    for burg in pack["burgs"]:
        if not isinstance(burg, dict) or not ((_num(burg.get("i")) or 0) > 0):
            continue  # index 0 is Azgaar's empty placeholder
        if burg.get("removed"):
            removed_count += 1
            continue
        reason = _invalid_reason(burg, len(pack["cells"]))
        if reason:
            invalid_records.append({"sourceId": burg["i"], "name": burg.get("name"), "reason": reason})
        else:
            settlements.append(_settlement_record(burg, ctx))
    settlements.sort(key=lambda s: s["sourceId"])

    named = sum(s["population"] for s in settlements)
    rural = rural_inhabitants(pack["cells"], scale)
    states = _region_summaries([
        {"id": state_id(s["i"]), "sourceId": s["i"], "name": s["name"], "fullName": s.get("fullName") or s["name"],
         "color": s.get("color"), "ruralPopulation": js_round((_num(s.get("rural")) or 0) * scale["ruralInhabitantsPerPoint"])}
        for s in ctx["states"].values()
    ], "stateId", settlements)
    provinces = _region_summaries([
        {"id": province_id(p["i"]), "sourceId": p["i"], "name": p["name"],
         "stateId": state_id(p["state"]) if (p.get("state") or 0) > 0 else None}
        for p in ctx["provinces"].values()
    ], "provinceId", settlements)
    cultures = _region_summaries([
        {"id": culture_id(c["i"]), "sourceId": c["i"], "name": c["name"]} for c in ctx["cultures"].values()
    ], "cultureId", settlements)

    observed = {"settlements": len(settlements), "provinces": len(provinces), "states": len(states), "cultures": len(cultures)}
    reference = (simulator_config["world"].get("referenceCounts") or {}).get(identity["mapId"])
    options = settings.get("options") or {}
    return {
        "identity": identity,
        "sourceSettings": {
            **scale,
            "distanceUnit": settings.get("distanceUnit"),
            "distanceScale": _num(settings.get("distanceScale")) or 1,
            "year": options.get("year"),
            "era": options.get("era"),
        },
        "mapSize": {"width": document["info"]["width"], "height": document["info"]["height"]},
        "populationInterpretation": interpretation_notes(scale),
        "counts": observed,
        "referenceCheck": {k: {"expected": v, "observed": observed[k], "matches": v == observed[k]} for k, v in reference.items()}
        if reference else None,
        "population": {"named": named, "rural": rural, "total": named + rural},
        "classDistribution": class_distribution(settlements, classes),
        "invalidRecords": invalid_records,
        "removedCount": removed_count,
        "settlements": settlements,
        "states": states,
        "provinces": provinces,
        "cultures": cultures,
    }
