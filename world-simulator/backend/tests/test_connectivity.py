from world_sim.geography.connectivity import build_settlement_connectivity
from world_sim.world.audit import build_world_audit


def connectivity_for(config, document):
    audit = build_world_audit({"identity": {"mapId": "fixture"}, "document": document}, config.simulator)
    return build_settlement_connectivity(audit, document["pack"]["routes"], config.simulator["connectivity"])


def by_source(c):
    return {s["settlementId"].rsplit(":", 1)[1]: s for s in c["settlements"]}


def test_routes_join_settlements_through_cells_and_junctions(config, fixture_document):
    c = connectivity_for(config, fixture_document)
    s = by_source(c)
    assert c["components"][0]["settlementIds"] == [f"settlement:azgaar-burg:{i}" for i in (1, 2, 3, 4)]
    assert s["2"]["roadComponentId"] == s["4"]["roadComponentId"]
    assert [link["settlementId"] for link in s["2"]["roadLinks"]] == ["settlement:azgaar-burg:1"], "a junction is not a direct link"
    assert next(r for r in c["routes"] if r["routeId"] == 0)["length"] == 45, "15 px x distanceScale 3"


def test_proximity_never_counts_as_connectivity(config, fixture_document):
    lonely = by_source(connectivity_for(config, fixture_document))["5"]
    assert not lonely["roadConnected"] and not lonely["onLandRoute"]
    assert lonely["nearby"][0]["settlementId"] == "settlement:azgaar-burg:2"
    assert lonely["nearby"][0]["sameRoadComponent"] is False
    assert [link["settlementId"] for link in lonely["seaLinks"]] == ["settlement:azgaar-burg:3"]


def test_routes_crossing_fewer_than_two_settlements_are_unresolved(config, fixture_document):
    c = connectivity_for(config, fixture_document)
    assert [r["routeId"] for r in c["unresolvedRoutes"]] == [2]
    assert c["summary"]["isolatedSettlements"] == 1


def test_points_without_cell_ids_use_the_coordinate_tolerance(config, fixture_document):
    fixture_document["pack"]["routes"].append({"i": 4, "group": "trails", "points": [[40.5, 10.5], [60, 60, 10]]})
    c = connectivity_for(config, fixture_document)
    assert next(r for r in c["routes"] if r["routeId"] == 4)["coordinateMatches"] == 1


def test_eldara_connectivity_is_consistent(eldara):
    c = eldara.connectivity
    assert c["summary"]["landRoutes"] + c["summary"]["seaRoutes"] == 433
    assert sum(comp["size"] for comp in c["components"]) + c["summary"]["isolatedSettlements"] == 502
    component = {s["settlementId"]: s["roadComponentId"] for s in c["settlements"]}
    for s in c["settlements"]:
        for link in s["roadLinks"]:
            assert component[link["settlementId"]] == s["roadComponentId"]
