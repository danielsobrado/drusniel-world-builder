"""Regression tests for the PR3 review: frozen rulesets, snapshot lineage, calendars, homes, premises, light views."""

import copy
import dataclasses
import json
import shutil

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.api.errors import ApiError
from world_sim.canonical import compact_json
from world_sim.simulation.contracts import Business, CreateScenario
from world_sim.simulation.employment import fill_jobs
from world_sim.simulation.engine import baseline_state, state_checksum
from world_sim.simulation.manager import ScenarioManager


def with_config(model, **changes):
    return dataclasses.replace(model, config=dataclasses.replace(model.config, **changes))


def test_a_saved_scenario_keeps_its_rules_after_the_yaml_changes(fresh_model):
    first = ScenarioManager(fresh_model)
    first.step("baseline-pilot", 360)
    first.snapshot("baseline-pilot", "year one")
    first.step("baseline-pilot", 720)
    expected = first.session("baseline-pilot").checksum

    society = copy.deepcopy(fresh_model.config.society)
    society["labour"]["participation"]["adults"] = 0.7
    changed = with_config(fresh_model, society=society)
    second = ScenarioManager(changed)
    status = second.status(second.session("baseline-pilot"))
    assert status["rulesCurrent"] is False, "the status says the YAML has moved on"
    second.restore("baseline-pilot", "snap-001")
    second.step("baseline-pilot", 720)
    assert second.session("baseline-pilot").checksum == expected, "the snapshot replays to its original future"

    fresh = second.create(CreateScenario(name="New rules"))
    assert fresh.meta.rulesFingerprint != second.session("baseline-pilot").meta.rulesFingerprint
    assert fresh.meta.rules["society"]["labour"]["participation"]["adults"] == 0.7


def test_snapshots_from_another_scenario_or_map_are_refused(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.snapshot("baseline-pilot", "mine")
    other = manager.create(CreateScenario(name="Other"))
    root = fresh_model.config.root / fresh_model.config.simulation["storage"]
    (root / other.meta.id / "snapshots").mkdir(parents=True, exist_ok=True)
    shutil.copy(root / "baseline-pilot" / "snapshots" / "snap-001.json", root / other.meta.id / "snapshots" / "snap-001.json")
    with pytest.raises(ApiError) as err:
        manager.restore(other.meta.id, "snap-001")
    assert err.value.status == 409 and err.value.code == "foreign_snapshot"

    # A snapshot rewritten for another source map, with a matching checksum, is refused too.
    path = root / "baseline-pilot" / "snapshots" / "snap-001.json"
    bundle = json.loads(path.read_text())
    state = manager._snapshot_state("baseline-pilot", "snap-001")[1]
    foreign = state.model_copy(update={"world": state.world.model_copy(update={"sourceFingerprint": "sha256:other"})})
    bundle["state"], bundle["meta"]["checksum"] = foreign.model_dump(), state_checksum(foreign)
    path.write_text(compact_json(bundle))
    with pytest.raises(ApiError) as err:
        manager.restore("baseline-pilot", "snap-001")
    assert err.value.code == "foreign_snapshot"


def test_map_rename_keeps_scenarios_and_snapshots_usable(fresh_model):
    manager = ScenarioManager(fresh_model)
    scenario_id = "baseline-pilot"
    original = manager.session(scenario_id)
    snapshot = manager.snapshot(scenario_id, "Before the rename")
    previous = fresh_model.renamed_from
    assert previous is not None
    old_world = original.state.world.model_copy(update={key: previous[key] for key in ("mapId", "sourceFingerprint")})
    old_state = original.state.model_copy(update={"world": old_world})
    meta, _, events, _ = manager.store.load(scenario_id)
    meta["rules"]["peoples"].update(mapNames=[previous["mapName"]], mappedMapIds=[previous["mapId"]],
                                    catalogId=previous["cultureCatalogId"])
    manager.store.save(scenario_id, meta, old_state.model_dump(), events)
    manager.store.save_snapshot(scenario_id, {**snapshot.model_dump(), "checksum": state_checksum(old_state)},
                                old_state.model_dump())

    reloaded = ScenarioManager(fresh_model)
    current = reloaded.writable(scenario_id)
    assert current.state.model_dump() == original.state.model_dump()
    assert reloaded.status(current)["rulesCurrent"]
    assert reloaded.store.load(scenario_id)[1]["world"] == original.state.world.model_dump()
    assert reloaded.restore(scenario_id, snapshot.id).state.model_dump() == original.state.model_dump()


def test_wages_follow_the_configured_month_length(astalor):
    business = Business(id="b", settlementId="s", kind="farm", name="Farm", sector="agriculture", profession="farmhand",
                        staff=4, wage=3, filled=0)
    _, employment, _ = fill_jobs([business], 4, ["agriculture"], 28)
    assert employment.wageBillPerMonth == 4 * 3 * 28
    sim = copy.deepcopy(astalor.config.simulation)
    sim["calendar"]["daysPerMonth"] = 28
    model = with_config(astalor, simulation=sim)
    state = baseline_state(model, scenario_id="t", settlement_ids=[r["settlementId"] for r in model.pilot["roles"]], seed=1,
                           start_year=1212)
    for s in state.settlements:
        assert s.society.employment.wageBillPerMonth == sum(b.filled * b.wage for b in s.society.businesses) * 28
        assert s.economy.food.wanted == s.population * 28, "rations are counted in calendar days too"


def test_named_households_live_in_identified_buildings(astalor):
    state = baseline_state(astalor, scenario_id="t", settlement_ids=[r["settlementId"] for r in astalor.pilot["roles"]], seed=1,
                           start_year=1212)
    cast = state.cast
    homes = {d.id: d for d in cast.dwellings}
    assert all(h.homeId in homes and homes[h.homeId].type == h.housing for h in cast.households)
    for d in cast.dwellings:
        _, source, kind, n = d.id.split(":")
        stock = next(h for s in state.settlements if s.sourceId == int(source) for h in s.society.housing if h.type == kind)
        assert 1 <= int(n) <= stock.buildings and len(d.households) <= d.capacity
    shared = [d for d in cast.dwellings if d.capacity > 1]
    assert all(len(d.households) <= d.capacity for d in shared)


def test_light_views_and_diagnostics(fresh_model):
    client = TestClient(create_app(fresh_model))
    full = client.get("/api/scenarios/baseline-pilot/state").content
    summary = client.get("/api/scenarios/baseline-pilot/summary")
    body = summary.json()["data"]
    assert len(summary.content) * 4 < len(full), "the summary is a fraction of the full state"
    assert all(s["society"]["businesses"] == [] and s["businessSummary"]["count"] > 100 for s in body["settlements"])
    assert "cast" not in body and body["trade"]["routes"]
    rows = client.get("/api/scenarios/baseline-pilot/diagnostics").json()["data"]
    assert {r["name"] for r in rows} == {"Falanenerwin", "Sshanderi", "Vhaltha"}
    for r in rows:
        assert r["ruralOperations"] + r["homeWorkshops"] + r["urbanPremises"] <= r["businesses"]
        assert r["urbanPremisesPerDwelling"] < 0.35 and r["flags"] == []
    business = client.get("/api/scenarios/baseline-pilot/businesses?pageSize=1").json()["data"][0]
    detail = client.get(f"/api/scenarios/baseline-pilot/businesses/{business['id']}").json()["data"]
    assert "premisesId" in detail


def test_a_scenario_computing_off_the_loop_refuses_other_changes(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.session("baseline-pilot").busy = True
    with pytest.raises(ApiError) as err:
        manager.step("baseline-pilot", 1)
    assert err.value.code == "busy"
