"""Scenario files: <storage>/<id>/{scenario,state,events}.json and snapshots/<snapshot>.json."""

import json
import os
import re
from pathlib import Path
from typing import Any

from ..canonical import canonical_json
from .contracts import Event, ScenarioMeta, ScenarioState, SnapshotMeta

ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,63}$")


def slugify(text: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", text.lower())).strip("-")[:48] or "scenario"


def _write(path: Path, value: Any) -> None:
    """Atomic replace, so a crash never leaves half a file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(canonical_json(value), encoding="utf-8")
    os.replace(tmp, path)


def _read(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


class ScenarioStore:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def _dir(self, scenario_id: str) -> Path:
        if not ID_PATTERN.match(scenario_id):
            raise ValueError(f"invalid scenario id {scenario_id!r}")
        return self.root / scenario_id

    def ids(self) -> list[str]:
        return sorted(p.name for p in self.root.iterdir() if p.is_dir() and ID_PATTERN.match(p.name) and (p / "scenario.json").is_file())

    def exists(self, scenario_id: str) -> bool:
        return (self._dir(scenario_id) / "scenario.json").is_file()

    def load(self, scenario_id: str) -> tuple[ScenarioMeta, ScenarioState, list[Event]]:
        d = self._dir(scenario_id)
        events = [Event(**e) for e in _read(d / "events.json")] if (d / "events.json").is_file() else []
        return ScenarioMeta(**_read(d / "scenario.json")), ScenarioState(**_read(d / "state.json")), events

    def save_meta(self, meta: ScenarioMeta) -> None:
        _write(self._dir(meta.id) / "scenario.json", meta.model_dump())

    def save_state(self, scenario_id: str, state: ScenarioState) -> None:
        _write(self._dir(scenario_id) / "state.json", state.model_dump())

    def save_events(self, scenario_id: str, events: list[Event]) -> None:
        _write(self._dir(scenario_id) / "events.json", [e.model_dump() for e in events])

    def save_snapshot(self, scenario_id: str, meta: SnapshotMeta, state: ScenarioState) -> None:
        _write(self._dir(scenario_id) / "snapshots" / f"{meta.id}.json", {"meta": meta.model_dump(), "state": state.model_dump()})

    def snapshots(self, scenario_id: str) -> list[SnapshotMeta]:
        folder = self._dir(scenario_id) / "snapshots"
        if not folder.is_dir():
            return []
        return sorted((SnapshotMeta(**_read(p)["meta"]) for p in folder.glob("*.json")), key=lambda m: m.id)

    def load_snapshot(self, scenario_id: str, snapshot_id: str) -> tuple[SnapshotMeta, ScenarioState] | None:
        if not ID_PATTERN.match(snapshot_id):
            return None
        path = self._dir(scenario_id) / "snapshots" / f"{snapshot_id}.json"
        if not path.is_file():
            return None
        raw = _read(path)
        return SnapshotMeta(**raw["meta"]), ScenarioState(**raw["state"])
