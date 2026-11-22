"""Deterministic JSON: sorted keys, JS-style numbers, no NaN. Same inputs give the same bytes."""

import json
import math
from typing import Any


def _number(value: float | int) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if not math.isfinite(value):
        raise ValueError("non_finite_number")
    if value.is_integer() and abs(value) < 1e21:
        return str(int(value))
    text = repr(value)
    # JS prints 1e-07 as 1e-7 and 1e+21 as 1e+21; Python pads the exponent.
    if "e" in text:
        mantissa, exponent = text.split("e")
        sign = "-" if exponent.startswith("-") else "+"
        text = f"{mantissa}e{sign}{exponent.lstrip('+-').lstrip('0') or '0'}"
    return text


def canonicalize(value: Any) -> Any:
    """Plain JSON-compatible structure with sorted dict keys; tuples and sets become lists."""
    if isinstance(value, dict):
        return {str(k): canonicalize(value[k]) for k in sorted(value, key=str)}
    if isinstance(value, (list, tuple)):
        return [canonicalize(v) for v in value]
    if isinstance(value, (set, frozenset)):
        return [canonicalize(v) for v in sorted(value, key=str)]
    if isinstance(value, float) and not math.isfinite(value):
        raise ValueError("non_finite_number")
    return value


def _dump(value: Any, indent: str | None, depth: int, out: list[str]) -> None:
    if value is None:
        out.append("null")
    elif isinstance(value, (bool, int, float)):
        out.append(_number(value))
    elif isinstance(value, str):
        out.append(json.dumps(value, ensure_ascii=False))
    elif isinstance(value, (list, dict)):
        items = list(value.items()) if isinstance(value, dict) else list(enumerate(value))
        open_, close = ("{", "}") if isinstance(value, dict) else ("[", "]")
        if not items:
            out.append(open_ + close)
            return
        out.append(open_)
        for index, (key, item) in enumerate(items):
            if index:
                out.append(",")
            if indent is not None:
                out.append("\n" + indent * (depth + 1))
            if isinstance(value, dict):
                out.append(json.dumps(key, ensure_ascii=False) + (": " if indent is not None else ":"))
            _dump(item, indent, depth + 1, out)
        if indent is not None:
            out.append("\n" + indent * depth)
        out.append(close)
    else:
        raise TypeError(f"unsupported_serialize_type:{type(value).__name__}")


def canonical_serialize(value: Any, indent: int | None = None) -> str:
    out: list[str] = []
    _dump(canonicalize(value), " " * indent if indent else None, 0, out)
    return "".join(out)


def canonical_json(value: Any) -> str:
    """Pretty canonical JSON with a trailing newline, for files on disk."""
    return canonical_serialize(value, indent=2) + "\n"


def checksum(value: Any) -> str:
    """FNV-1a over UTF-16 code units of the compact form; matches src/sim checksumCanonical."""
    text = canonical_serialize(value)
    h = 2166136261
    data = text.encode("utf-16-le")
    for i in range(0, len(data), 2):
        h ^= data[i] | (data[i + 1] << 8)
        h = (h * 16777619) & 0xFFFFFFFF
    return f"{h:08x}"
