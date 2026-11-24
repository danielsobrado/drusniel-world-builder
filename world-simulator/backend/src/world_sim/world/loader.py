"""Reads an Azgaar Full JSON listed in the map manifest. The source file is never written."""

import hashlib
import json
from pathlib import Path
from typing import Any

SUPPORTED_FORMAT = "azgaar-full-json"


class InvalidSource(ValueError):
    code = "invalid_source"

    def __init__(self, message: str):
        super().__init__(f"Azgaar source invalid: {message}")


def resolve_map_entry(manifest_path: Path, maps_directory: Path, map_id: str) -> dict[str, Any]:
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    entry = next((m for m in manifest.get("maps", []) if m.get("id") == map_id), None)
    if entry is None:
        raise ValueError(f'Map "{map_id}" is not listed in {Path(manifest_path).name}')
    if entry.get("format") != SUPPORTED_FORMAT:
        raise ValueError(f'Map "{map_id}" has format {entry.get("format")}; only {SUPPORTED_FORMAT} is supported')
    root = Path(maps_directory).resolve()
    file = (root / entry["url"]).resolve()
    if not file.is_relative_to(root):
        raise ValueError(f'Map "{map_id}" resolves outside the maps directory')
    return {**entry, "file": file}


def _positive(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0


def validate_document(document: Any) -> dict[str, Any]:
    """Checks the fields the audit reads; raises with the first problem found."""
    if not isinstance(document, dict):
        raise InvalidSource("document is not an object")
    info, settings, pack = document.get("info") or {}, document.get("settings") or {}, document.get("pack")
    if not (_positive(info.get("width")) and _positive(info.get("height"))):
        raise InvalidSource("info.width/height must be positive")
    for key in ("populationRate", "urbanization"):
        try:
            ok = float(settings.get(key)) > 0
        except (TypeError, ValueError):
            ok = False
        if not ok:
            raise InvalidSource(f"settings.{key} must be positive")
    if not isinstance(pack, dict):
        raise InvalidSource("pack must be an object")
    for key in ("cells", "burgs", "states", "provinces", "cultures"):
        if not isinstance(pack.get(key), list) or not pack[key]:
            raise InvalidSource(f"pack.{key} must be a non-empty array")
    for key in ("routes", "goods", "markets"):
        if pack.get(key) is not None and not isinstance(pack[key], list):
            raise InvalidSource(f"pack.{key} must be an array")
    for index, cell in enumerate(pack["cells"]):
        if not isinstance(cell, dict) or cell.get("i") != index:
            found = cell.get("i") if isinstance(cell, dict) else None
            raise InvalidSource(f"pack.cells[{index}] has id {found}; cells must be indexed by id")
    return document


def load_azgaar_world(manifest_path: Path, maps_directory: Path, map_id: str) -> dict[str, Any]:
    entry = resolve_map_entry(manifest_path, maps_directory, map_id)
    raw = entry["file"].read_bytes()
    try:
        document = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise InvalidSource(f"JSON parse failed ({exc})") from exc
    validate_document(document)
    info = document["info"]
    return {
        "identity": {
            "mapId": entry["id"],
            "name": entry["name"],
            "sourceMapName": info.get("mapName"),
            "format": entry["format"],
            "fileName": entry["file"].name,
            "sourceFingerprint": f"sha256:{hashlib.sha256(raw).hexdigest()}",
            "azgaarVersion": info.get("version"),
            "seed": info.get("seed"),
            "azgaarMapId": info.get("mapId"),
            "exportedAt": info.get("exportedAt"),
        },
        "document": document,
    }
