import json

import pytest

from world_sim.world.audit import build_world_audit
from world_sim.world.classifier import classify_settlement
from world_sim.world.loader import InvalidSource, resolve_map_entry, validate_document
from world_sim.world.population import burg_inhabitants, population_scale, rural_inhabitants

IDENTITY = {"mapId": "fixture"}


def test_map_entries_must_be_listed_and_stay_inside_the_maps_directory(tmp_path):
    maps = tmp_path / "maps"
    maps.mkdir()
    manifest = maps / "manifest.json"
    manifest.write_text(json.dumps({"maps": [
        {"id": "escape", "url": "../secret.json", "format": "azgaar-full-json"},
        {"id": "other", "url": "a.map", "format": "azgaar-map"},
    ]}))
    with pytest.raises(ValueError, match="outside the maps directory"):
        resolve_map_entry(manifest, maps, "escape")
    with pytest.raises(ValueError, match="only azgaar-full-json"):
        resolve_map_entry(manifest, maps, "other")
    with pytest.raises(ValueError, match="not listed"):
        resolve_map_entry(manifest, maps, "missing")


def test_malformed_documents_name_the_failing_field(fixture_document):
    with pytest.raises(InvalidSource, match="not an object"):
        validate_document(None)
    bad_rate = {**fixture_document, "settings": {**fixture_document["settings"], "populationRate": 0}}
    with pytest.raises(InvalidSource, match="populationRate"):
        validate_document(bad_rate)
    no_burgs = {**fixture_document, "pack": {**fixture_document["pack"], "burgs": []}}
    with pytest.raises(InvalidSource, match="pack.burgs"):
        validate_document(no_burgs)
    assert validate_document(fixture_document)["info"]["width"] == 100


def test_population_points_convert_with_rate_and_urbanization():
    scale = population_scale({"populationRate": 1000, "urbanization": 1})
    assert burg_inhabitants(14.468, scale) == 14468
    assert burg_inhabitants(2, population_scale({"populationRate": 500, "urbanization": 1.5})) == 1500
    assert rural_inhabitants([{"pop": 1.25}, {"pop": 0.5}, {}], scale) == 1750


def test_classification_boundaries(config):
    classes = config.simulator["classification"]
    got = [classify_settlement(n, classes)["id"] for n in (0, 999, 1000, 2999, 3000, 7999, 8000, 14999, 15000, 24999, 25000, 10**7)]
    assert got == ["named-village", "named-village", "small-town", "small-town", "town", "town",
                   "large-town", "large-town", "city", "city", "major-city", "major-city"]


def test_audit_keeps_valid_settlements_reports_invalid_and_removed(config, fixture_document):
    audit = build_world_audit({"identity": IDENTITY, "document": fixture_document}, config.simulator)
    assert [s["sourceId"] for s in audit["settlements"]] == [1, 2, 3, 4, 5]
    assert audit["removedCount"] == 1
    assert audit["invalidRecords"] == [{"sourceId": 7, "name": "", "reason": "missing name"}]
    three = audit["settlements"][2]
    assert three["id"] == "settlement:azgaar-burg:3"
    assert three["stateId"] == "region:azgaar-state:1"
    assert three["provinceName"] == "North"
    assert three["population"] == 16000
    assert three["class"] == "city"
    assert [g["name"] for g in three["economy"]["craftedGoods"]] == ["Tools"]
    assert three["economy"]["marketCenter"] is True
    assert audit["counts"]["states"] == 1, "removed states are excluded"
    assert audit["population"]["named"] == 500 + 2500 + 16000 + 30000 + 1000
    assert audit["population"]["rural"] == 12000


def test_astalor_matches_the_documented_reference_counts(astalor):
    audit = astalor.audit
    assert audit["counts"] == {"settlements": 502, "provinces": 131, "states": 8, "cultures": 14}
    assert all(c["matches"] for c in audit["referenceCheck"].values())
    assert audit["invalidRecords"] == []
    assert audit["population"]["named"] == 3592734
    assert audit["population"]["total"] == audit["population"]["named"] + audit["population"]["rural"]
    assert sum(c["count"] for c in audit["classDistribution"]) == 502
    assert len({s["id"] for s in audit["settlements"]}) == 502
    assert sum(s["capital"] for s in audit["settlements"]) == 8
