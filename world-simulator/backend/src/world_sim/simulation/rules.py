"""
The rules a scenario runs under, frozen when it is created. Editing the YAML later
changes only new scenarios: a saved scenario and its snapshots always continue under
the rules they started with, so a snapshot replays to the same future.
"""

import hashlib
from typing import Any

from ..canonical import compact_json

# Simulation settings that change outcomes; storage, run speeds and the baseline recipe do not.
OUTCOME_KEYS = ("calendar", "stepSizes", "limits", "demography", "people", "history")


def freeze(rules: dict[str, Any]) -> dict[str, Any]:
    sim = rules["simulation"]
    return {"simulation": {k: sim[k] for k in OUTCOME_KEYS if k in sim}, "society": rules["society"], "economy": rules["economy"]}


def complete(frozen: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """A frozen ruleset with settings introduced after it was frozen taken from the current config; its own values win."""
    now = freeze(current)
    return {section: {**now[section], **frozen.get(section, {})} for section in now}


def fingerprint(frozen: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(compact_json(frozen).encode("utf-8")).hexdigest()
