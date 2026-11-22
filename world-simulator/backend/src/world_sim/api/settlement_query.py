"""Validated filtering, sorting and paging for GET /api/world/settlements."""

import math
from collections.abc import Mapping
from typing import Any

from .errors import ApiError

SORT_FIELDS = ("sourceId", "name", "population", "npcs", "stateName", "cultureName", "class")
ALLOWED = ("page", "pageSize", "q", "class", "state", "culture", "minPopulation", "maxPopulation", "capital", "pilot",
           "sort", "order")


def _invalid(name: str, message: str, **details: Any) -> ApiError:
    return ApiError(400, "invalid_parameter", message, {"parameter": name, **details})


def _integer(params: Mapping[str, str], name: str, minimum: int, maximum: int | None, fallback: int | None) -> int | None:
    if name not in params:
        return fallback
    raw = params[name].strip()
    try:
        value = int(raw)
    except ValueError:
        value = None
    if value is None or value < minimum or (maximum is not None and value > maximum):
        bound = f" from {minimum} to {maximum}" if maximum is not None else f" >= {minimum}"
        raise _invalid(name, f"{name} must be an integer{bound}")
    return value


def _boolean(params: Mapping[str, str], name: str) -> bool | None:
    if name not in params:
        return None
    if params[name] not in ("true", "false"):
        raise _invalid(name, f"{name} must be true or false")
    return params[name] == "true"


def _list(params: Mapping[str, str], name: str) -> list[str] | None:
    if name not in params:
        return None
    return [v.strip() for v in params[name].split(",") if v.strip()]


def parse_settlement_query(params: Mapping[str, str], api_config: dict[str, Any], class_ids: list[str]) -> dict[str, Any]:
    """Unknown parameters are rejected rather than ignored."""
    for key in params:
        if key not in ALLOWED:
            raise _invalid(key, f"Unknown parameter {key}", allowed=list(ALLOWED))
    query = {
        "page": _integer(params, "page", 1, None, 1),
        "pageSize": _integer(params, "pageSize", 1, api_config["maxPageSize"], api_config["defaultPageSize"]),
        "q": (params.get("q") or "").strip().casefold() or None,
        "classes": _list(params, "class"),
        "states": _list(params, "state"),
        "cultures": _list(params, "culture"),
        "minPopulation": _integer(params, "minPopulation", 0, None, None),
        "maxPopulation": _integer(params, "maxPopulation", 0, None, None),
        "capital": _boolean(params, "capital"),
        "pilot": _boolean(params, "pilot"),
        "sort": params.get("sort", "sourceId"),
        "order": params.get("order", "asc"),
    }
    if query["sort"] not in SORT_FIELDS:
        raise _invalid("sort", f"sort must be one of {', '.join(SORT_FIELDS)}")
    if query["order"] not in ("asc", "desc"):
        raise _invalid("order", "order must be asc or desc")
    unknown = [c for c in query["classes"] or [] if c not in class_ids]
    if unknown:
        raise _invalid("class", f"Unknown settlement class {', '.join(unknown)}", allowed=class_ids)
    if query["minPopulation"] is not None and query["maxPopulation"] is not None and query["minPopulation"] > query["maxPopulation"]:
        raise _invalid("minPopulation", "minPopulation must not exceed maxPopulation")
    return query


def _matches(row: dict[str, Any], q: dict[str, Any]) -> bool:
    return ((not q["q"] or q["q"] in row["name"].casefold())
            and (q["classes"] is None or row["class"] in q["classes"])
            and (q["states"] is None or (row["stateId"] or "none") in q["states"])
            and (q["cultures"] is None or (row["cultureId"] or "none") in q["cultures"])
            and (q["minPopulation"] is None or row["population"] >= q["minPopulation"])
            and (q["maxPopulation"] is None or row["population"] <= q["maxPopulation"])
            and (q["capital"] is None or row["capital"] == q["capital"])
            and (q["pilot"] is None or row["pilot"] == q["pilot"]))


def query_settlements(rows: list[dict[str, Any]], q: dict[str, Any]) -> dict[str, Any]:
    field = q["sort"]
    is_text = field in ("name", "stateName", "cultureName", "class")
    # Ties always break by ascending source id, whichever direction the primary key sorts.
    filtered = sorted((r for r in rows if _matches(r, q)), key=lambda r: r["sourceId"])
    filtered.sort(key=lambda r: (str(r[field] or "").casefold() if is_text else (r[field] or 0)), reverse=q["order"] == "desc")
    total_pages = max(1, math.ceil(len(filtered) / q["pageSize"]))
    start = (q["page"] - 1) * q["pageSize"]
    return {
        "items": filtered[start:start + q["pageSize"]],
        "page": {"page": q["page"], "pageSize": q["pageSize"], "totalItems": len(filtered), "totalPages": total_pages},
    }
