"""
The rules a scenario runs under, frozen when it is created. Editing the YAML later
changes only new scenarios: a saved scenario and its snapshots always continue under
the rules they started with, so a snapshot replays to the same future.
"""

import hashlib
from typing import Any

from ..canonical import compact_json

# Simulation settings that change outcomes; storage, run speeds and the baseline recipe do not.
OUTCOME_KEYS = ("calendar", "stepSizes", "limits", "demography", "migration", "travel", "climate", "people", "history", "interventions")


def freeze(rules: dict[str, Any]) -> dict[str, Any]:
    sim = rules["simulation"]
    return {"simulation": {k: sim[k] for k in OUTCOME_KEYS if k in sim}, "society": rules["society"], "economy": rules["economy"],
            "peoples": rules.get("peoples", {})}


def complete(frozen: dict[str, Any], current: dict[str, Any]) -> dict[str, Any]:
    """A frozen ruleset with settings introduced after it was frozen taken from the current config; its own values win.
    The people rules gain `daysPerMonth` and `daysPerYear` from the same frozen calendar, so every age and span
    follows the scenario's own year."""
    now = freeze(current)
    rules = {section: {**now[section], **frozen.get(section, {})} for section in now}
    if "climate" not in frozen.get("simulation", {}):
        rules["simulation"]["climate"] = {"enabled": False}
    calendar = rules["simulation"]["calendar"]
    people = {**rules["simulation"]["people"], "ancestries": rules["peoples"].get("ancestries", {}),
              "cultureProfiles": rules["peoples"].get("profiles", {}), "daysPerMonth": calendar["daysPerMonth"],
              "daysPerYear": calendar["daysPerMonth"] * calendar["monthsPerYear"]}
    return {**rules, "simulation": {**rules["simulation"], "people": people}}


def ready(rules: dict[str, Any]) -> dict[str, Any]:
    """The current config as a scenario would run it (a new scenario's rules before they are frozen)."""
    return complete(freeze(rules), rules)


def fingerprint(frozen: dict[str, Any]) -> str:
    return "sha256:" + hashlib.sha256(compact_json(frozen).encode("utf-8")).hexdigest()
