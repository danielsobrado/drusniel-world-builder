"""
Scenario files. Each scenario is one bundle, <storage>/<id>/scenario.json holding
{formatVersion, meta, state, events}, written by a single atomic replace, so metadata,
state and events can never disagree after a crash. Snapshots are one file each.
Raw dicts go in and out; schema migration happens in the manager.
"""

import json
import os
import re
from copy import deepcopy
from pathlib import Path
from typing import Any

from ..canonical import compact_json

FORMAT_VERSION = 2   # 1 = PR2's separate scenario/state/events files
ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")
LEGACY_FILES = ("state.json", "events.json")


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:48] or "scenario"


def _write(path: Path, value: Any) -> None:
    """Atomic replace: readers see the old file or the new one, never half of either."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(compact_json(value), encoding="utf-8")
    os.replace(tmp, path)


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class ScenarioStore:
    def __init__(self, root: Path):
        self.root = root
        self._snapshot_meta: dict[Path, tuple[tuple[int, int, int], dict[str, Any]]] = {}
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, scenario_id: str) -> Path:
        if not ID_PATTERN.match(scenario_id):
            raise ValueError(f"invalid scenario id {scenario_id!r}")
        return self.root / scenario_id

    def history_path(self, scenario_id: str) -> Path:
        return self._dir(scenario_id) / "history.sqlite"

    def ids(self) -> list[str]:
        return sorted(p.name for p in self.root.iterdir()
                      if p.is_dir() and ID_PATTERN.match(p.name) and (p / "scenario.json").is_file())

    def load(self, scenario_id: str) -> tuple[dict[str, Any], dict[str, Any], list[dict[str, Any]], int]:
        """Returns raw meta, state, events and the format version the files were in."""
        d = self._dir(scenario_id)
        raw = _read(d / "scenario.json")
        if raw.get("formatVersion") == FORMAT_VERSION:
            return raw["meta"], raw["state"], raw["events"], FORMAT_VERSION
        events = _read(d / "events.json") if (d / "events.json").is_file() else []
        return raw, _read(d / "state.json"), events, 1

    def save(self, scenario_id: str, meta: dict[str, Any], state: dict[str, Any], events: list[dict[str, Any]]) -> None:
        d = self._dir(scenario_id)
        _write(d / "scenario.json", {"formatVersion": FORMAT_VERSION, "meta": meta, "state": state, "events": events})
        for name in LEGACY_FILES:  # the bundle now holds them
            (d / name).unlink(missing_ok=True)

    def save_snapshot(self, scenario_id: str, meta: dict[str, Any], state: dict[str, Any]) -> None:
        _write(self._dir(scenario_id) / "snapshots" / f"{meta['id']}.json", {"meta": meta, "state": state})

    def snapshots(self, scenario_id: str) -> list[dict[str, Any]]:
        folder = self._dir(scenario_id) / "snapshots"
        if not folder.is_dir():
            return []
        paths = set(folder.glob("*.json"))
        for path in list(self._snapshot_meta):
            if path.parent == folder and path not in paths:
                del self._snapshot_meta[path]
        rows = []
        for path in paths:
            stat = path.stat()
            signature = (stat.st_mtime_ns, stat.st_size, stat.st_ino)
            cached = self._snapshot_meta.get(path)
            if cached is None or cached[0] != signature:
                cached = (signature, _read(path)["meta"])
                self._snapshot_meta[path] = cached
            rows.append(deepcopy(cached[1]))
        return sorted(rows, key=lambda m: m["id"])

    def load_snapshot(self, scenario_id: str, snapshot_id: str) -> tuple[dict[str, Any], dict[str, Any]] | None:
        if not ID_PATTERN.match(snapshot_id):
            return None
        path = self._dir(scenario_id) / "snapshots" / f"{snapshot_id}.json"
        if not path.is_file():
            return None
        raw = _read(path)
        return raw["meta"], raw["state"]
