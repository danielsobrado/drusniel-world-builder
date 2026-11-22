"""Loads the YAML configuration in world-simulator/config; env vars override host, ports and map."""

import os
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import yaml

SIMULATOR_ROOT = Path(__file__).resolve().parents[3]


@dataclass(frozen=True)
class Config:
    root: Path
    simulator: dict[str, Any]
    npc: dict[str, Any]
    pilot: dict[str, Any]
    simulation: dict[str, Any]
    society: dict[str, Any]

    @property
    def class_ids(self) -> list[str]:
        return [c["id"] for c in self.simulator["classification"]]


def _read_yaml(path: Path) -> dict[str, Any]:
    try:
        return yaml.safe_load(path.read_text(encoding="utf-8"))
    except (OSError, yaml.YAMLError) as exc:
        raise ValueError(f"Cannot read configuration {path.name}: {exc}") from exc


def _port(value: Any, name: str) -> int:
    try:
        port = int(value)
    except (TypeError, ValueError):
        port = -1
    if not 1 <= port <= 65535 or str(port) != str(value).strip():
        raise ValueError(f"{name} must be a TCP port, got {value}")
    return port


def _validate_classification(classes: Any) -> None:
    if not isinstance(classes, list) or not classes:
        raise ValueError("classification must be a non-empty list")
    previous = 0
    for index, entry in enumerate(classes):
        last = index == len(classes) - 1
        if not isinstance(entry.get("id"), str):
            raise ValueError(f"classification[{index}] needs an id")
        bound = entry.get("maxPopulation")
        if (bound is not None) if last else not (isinstance(bound, (int, float)) and bound > previous):
            raise ValueError(f"classification[{index}] maxPopulation must increase, and only the last class may be unbounded")
        previous = bound


def _validate_npc(npc: Any, class_ids: list[str]) -> None:
    if not (isinstance(npc.get("target"), int) and npc["target"] >= 0):
        raise ValueError("npc-population target must be a non-negative integer")
    for class_id in class_ids:
        r = (npc.get("ranges") or {}).get(class_id)
        if not r or not isinstance(r.get("min"), int) or not isinstance(r.get("max"), int) or r["min"] < 0 or r["max"] < r["min"]:
            raise ValueError(f"npc-population ranges.{class_id} needs integer min <= max")


def load_config(root: Path = SIMULATOR_ROOT, env: Mapping[str, str] | None = None) -> Config:
    env = os.environ if env is None else env
    simulator = _read_yaml(root / "config/simulator.yaml")
    npc = _read_yaml(root / "config/npc-population.yaml")
    pilot = _read_yaml(root / "config/pilot-selection.yaml")
    simulation = _read_yaml(root / "config/simulation.yaml")
    society = _read_yaml(root / "config/society.yaml")
    _validate_classification(simulator["classification"])
    _validate_npc(npc, [c["id"] for c in simulator["classification"]])
    if not isinstance(pilot.get("roles"), list) or len(pilot["roles"]) != 3:
        raise ValueError("pilot-selection needs exactly three roles")

    simulator["server"]["host"] = env.get("WS_BACKEND_HOST", simulator["server"]["host"])
    simulator["server"]["port"] = _port(env.get("WS_BACKEND_PORT", simulator["server"]["port"]), "server.port")
    simulator["frontend"]["port"] = _port(env.get("WS_FRONTEND_PORT", simulator["frontend"]["port"]), "frontend.port")
    simulator["world"]["mapId"] = env.get("WS_MAP_ID", simulator["world"]["mapId"])
    storage = env.get("WS_SCENARIO_STORAGE")
    if storage:
        simulation["storage"] = storage
    return Config(root=root, simulator=simulator, npc=npc, pilot=pilot, simulation=simulation, society=society)
