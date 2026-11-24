"""
The game export: versioned JSON the Drusniel game loads on approach to a settlement, so
the residents walking its streets are the simulation's named people. One small index for
the scenario, and one file per settlement with everyone living there.

Identity is the contract: a person keeps their `npc:<sourceId>:<n>` id across exports,
saves and the game, and settlements join on the Azgaar burg number the game also uses.
Introductions are the stored model prose when it is current, and otherwise the draft
writer's sentences drawn from the record.
"""

import json
from pathlib import Path
from typing import Any

from ..narration.draft import DraftWriter
from ..narration.service import Narrator
from ..simulation.manager import ScenarioManager

SCHEMA = "drusniel-world-sim-game-export"
VERSION = 1
# Who is seen in the streets: outlaws are out on the road and prisoners locked up.
IN_TOWN = ("trader", "worker", "retired", "unemployed", "child")
TIERS = {"major": 0, "standard": 1, "basic": 2}


def _prose(texts: list[dict[str, Any]], kind: str) -> dict[str, Any] | None:
    found = next((b for b in texts if b["kind"] == kind and not b["stale"]), None)
    return {"text": found["text"], "model": found["model"]} if found else None


class GameExport:
    def __init__(self, manager: ScenarioManager, narrator: Narrator):
        self.manager, self.narrator = manager, narrator
        self.draft = DraftWriter()

    def _resident(self, scenario_id: str, person: Any, businesses: dict[str, Any]) -> dict[str, Any]:
        context = self.narrator.context(scenario_id, person.id)
        texts = self.narrator.biographies(scenario_id, person.id)
        intro = _prose(texts, "self") or {"text": self.draft.complete([], 0, "self", context), "model": "draft writer"}
        work = businesses.get(person.businessId or "")
        return {
            "id": person.id, "name": person.name, "family": person.family, "sex": person.sex, "age": context["identity"]["age"],
            "role": person.role, "profession": person.profession or ("caravan master" if person.traderId else None),
            "tier": context["tier"], "identity": person.identity.model_dump(), "upbringing": person.upbringing.model_dump(),
            "householdId": person.householdId, "home": (context["household"] or {}).get("homeId"),
            "workplace": {"id": work.id, "name": work.name, "kind": work.kind, "sector": work.sector} if work else None,
            "mood": context["outlook"]["mood"], "hooks": [h["text"] for h in context["hooks"][:3]],
            "introduction": intro, "biography": _prose(texts, "short"),
        }

    def build(self, scenario_id: str) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
        """The index and one document per settlement, keyed by file name. Deterministic for a given state and prose."""
        session = self.manager.session(scenario_id)
        state = session.state
        header = {"schema": SCHEMA, "version": VERSION, "mapId": state.world.mapId, "sourceFingerprint": state.world.sourceFingerprint,
                  "scenarioId": scenario_id, "scenarioName": session.meta.name, "date": state.date.label, "day": state.date.day,
                  "stateChecksum": session.checksum}
        files, listed = {}, []
        for s in state.settlements:
            businesses = {b.id: b for b in s.society.businesses}
            people = [p for p in state.cast.people if p.alive and p.settlementId == s.settlementId and p.role in IN_TOWN]
            rows = sorted((self._resident(scenario_id, p, businesses) for p in people),
                          key=lambda r: (TIERS.get(r["tier"], 3), IN_TOWN.index(r["role"]), r["id"]))
            name = f"settlements/{s.sourceId}.json"
            files[name] = {**header, "settlementId": s.settlementId, "sourceId": s.sourceId, "name": s.name, "population": s.population,
                           "identity": s.identity.model_dump(), "infrastructure": [x.model_dump() for x in s.infrastructure],
                           "residents": rows}
            listed.append({"settlementId": s.settlementId, "sourceId": s.sourceId, "name": s.name, "population": s.population,
                           "residents": len(rows), "file": name})
        return {**header, "settlements": listed}, files

    def write(self, scenario_id: str, directory: Path) -> dict[str, Any]:
        """Writes the export, replacing the previous one (settlement files no longer listed are removed)."""
        index, files = self.build(scenario_id)
        (directory / "settlements").mkdir(parents=True, exist_ok=True)
        for old in (directory / "settlements").glob("*.json"):
            if f"settlements/{old.name}" not in files:
                old.unlink()
        for name, document in files.items():
            (directory / name).write_text(json.dumps(document, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        (directory / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        return {**index, "directory": str(directory)}
