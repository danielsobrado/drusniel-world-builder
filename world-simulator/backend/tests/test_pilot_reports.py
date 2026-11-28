import re

import pytest

from world_sim.canonical import canonical_json, checksum
from world_sim.pilot.selector import select_pilot
from world_sim.reports.builder import build_reports
from world_sim.world.model import build_world_model


def test_search_reproduces_the_pinned_pilot(astalor, config):
    searched = select_pilot(audit=astalor.audit, connectivity=astalor.connectivity, budget=astalor.budget,
                            pilot_config={**config.pilot, "pinnedSourceIds": []})
    assert searched["mode"] == "search"
    assert [r["sourceId"] for r in searched["roles"]] == config.pilot["pinnedSourceIds"]
    assert astalor.pilot["mode"] == "pinned"
    assert astalor.pilot["roles"] == searched["roles"]
    limit = config.pilot["constraints"]["maxRouteDistance"]
    assert all(0 < p["distancePx"] <= limit for p in astalor.pilot["pairwiseRoutes"])
    assert all(r["roleStatus"] == "hypothesis" and r["evidence"] for r in astalor.pilot["roles"])
    assert astalor.pilot["totalNpcs"] == sum(r["npcs"] for r in astalor.pilot["roles"])


def test_unknown_pinned_ids_fail_loudly(astalor, config):
    with pytest.raises(ValueError, match="99999"):
        select_pilot(audit=astalor.audit, connectivity=astalor.connectivity, budget=astalor.budget,
                     pilot_config={**config.pilot, "pinnedSourceIds": [1, 2, 99999]})


def test_reports_are_byte_identical_across_runs(astalor, config):
    first, second = build_reports(astalor), build_reports(build_world_model(config))
    assert sorted(first) == ["connectivity.json", "npc-budget-comparison.json", "pilot-settlements.json",
                             "settlements.json", "world-summary.json"]
    for name, report in first.items():
        text = canonical_json(report)
        assert text == canonical_json(second[name]), name
        assert not re.search(r"[A-Za-z]:\\\\|/Users/|generatedAt", text), f"{name} leaks a machine path or timestamp"
        assert report["meta"]["schemaVersion"] == 1
        assert re.fullmatch(r"sha256:[0-9a-f]{64}", report["meta"]["world"]["sourceFingerprint"])
        assert re.fullmatch(r"[0-9a-f]{8}", report["meta"]["configFingerprint"])
    ids = [s["sourceId"] for s in first["settlements.json"]["data"]]
    assert ids == sorted(ids)


def test_canonical_json_matches_javascript_formatting():
    assert canonical_json({"b": 1.0, "a": [1.5, 2e-7, True, None, "é"]}) == \
        '{\n  "a": [\n    1.5,\n    2e-7,\n    true,\n    null,\n    "é"\n  ],\n  "b": 1\n}\n'
    # Expected values come from src/sim/persistence/canonicalSerialize.js checksumCanonical.
    assert checksum({"a": 1}) == "8b9e4511"
    assert checksum({"b": [1.5, "é", None], "a": {"z": True}}) == "98e6f85c"
