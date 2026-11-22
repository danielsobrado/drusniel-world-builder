"""PR3 acceptance: households, housing, businesses and employment stay accounted for."""

import asyncio
import dataclasses
import json

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.api.errors import ApiError
from world_sim.canonical import checksum, compact_json
from world_sim.simulation.contracts import Business, Cohorts, CreateScenario
from world_sim.simulation.employment import fill_jobs
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.households import derive_households
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.society import check_invariants


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212,
                          sim_config=model.config.simulation, society_cfg=model.config.society)


def test_baseline_society_accounts_for_every_imported_person(eldara):
    for s in pilot(eldara).settlements:
        assert s.population == eldara.settlements_by_id[s.settlementId]["population"]
        assert check_invariants(s.population, s.cohorts, s.society) == []
        housed = sum(g.children + g.adults + g.elders for g in s.society.households)
        assert housed == s.population, "households hold exactly the imported population"
        assert s.society.overcrowdedHouseholds == 0, "baseline housing has headroom"
        assert {n.id for n in s.society.needs} == {"food", "housing", "livelihood", "safety"}


@pytest.mark.parametrize("cohorts", [(0, 0, 0), (0, 1, 0), (3, 0, 2), (5, 1, 0), (1, 2, 1), (40, 7, 3), (7, 100, 30)])
def test_households_never_create_or_lose_people(config, cohorts):
    children, adults, elders = cohorts
    groups = derive_households(Cohorts(children=children, adults=adults, elders=elders), config.society["households"])
    assert (sum(g.children for g in groups), sum(g.adults for g in groups), sum(g.elders for g in groups)) == cohorts
    for g in groups:
        assert g.households > 0
        assert not g.children or g.adults or g.kind == "communal", "children live with an adult"


def test_businesses_follow_settlement_and_source_evidence(eldara):
    by_name = {s.name: s for s in pilot(eldara).settlements}
    for s in by_name.values():
        ids = [b.id for b in s.society.businesses]
        assert len(ids) == len(set(ids)), "business ids are unique"
        assert all(b.settlementId == s.settlementId and b.staff >= 1 for b in s.society.businesses)
    goods = {b.good for b in by_name["Falanenerwin"].society.businesses if b.good}
    assert {"Arms", "Tools"} <= goods, "craft evidence becomes workshops"
    assert not any(b.kind == "mine" for s in by_name.values() for b in s.society.businesses), \
        "no pilot settlement extracts ore, so no mine is invented"
    assert any(b.kind == "merchant-house" for b in by_name["Vhaltha"].society.businesses), "market centre hosts merchant houses"
    assert not any(b.kind == "merchant-house" for b in by_name["Sshanderi"].society.businesses)


def test_jobs_never_exceed_eligible_labour_and_fill_by_priority():
    def biz(i, sector, staff):
        return Business(id=f"b{i}", settlementId="s", kind=sector, name=sector, sector=sector, profession="x",
                        staff=staff, wage=1, filled=0)
    businesses = [biz(1, "trade", 10), biz(2, "agriculture", 10), biz(3, "crafts", 10)]
    updated, employment, sectors = fill_jobs(businesses, 15, ["agriculture", "crafts", "trade"])
    assert employment.employed == 15 and employment.unemployed == 0 and employment.vacancies == 15
    assert [b.filled for b in updated] == [0, 10, 5], "agriculture first, then crafts, trade last"
    _, plenty, _ = fill_jobs(businesses, 100, ["agriculture", "crafts", "trade"])
    assert plenty.employed == 30 and plenty.unemployed == 70


def test_society_stays_consistent_over_a_decade_and_reproduces(eldara):
    cfg, society = eldara.config.simulation, eldara.config.society
    first, months = advance(pilot(eldara), 3600, cfg, society)
    second, _ = advance(pilot(eldara), 3600, cfg, society)
    assert state_checksum(first) == state_checksum(second), "same configuration and seed, same result"
    for s in first.settlements:
        assert check_invariants(s.population, s.cohorts, s.society) == []
    assert all(m["unemployed"] >= 0 for m in months)


def test_history_is_bounded_but_keeps_the_baseline(eldara):
    cfg = {**eldara.config.simulation, "limits": {**eldara.config.simulation["limits"], "maxHistoryPoints": 5}}
    state, _ = advance(pilot(eldara), 360, cfg, eldara.config.society)
    assert len(state.history) == 5
    assert state.history[0].day == 0 and state.history[-1].day == 360


def _write_legacy(root, model, *, fingerprint=None, schema=1):
    """A PR2-era scenario: separate files, schema v1 state without society."""
    state = pilot(model).model_dump()
    state["scenarioId"] = "legacy"
    state["schemaVersion"] = schema
    for s in state["settlements"]:
        del s["society"]
    if fingerprint:
        state["world"]["sourceFingerprint"] = fingerprint
    folder = root / "legacy"
    (folder / "snapshots").mkdir(parents=True)
    meta = {"id": "legacy", "name": "Legacy", "description": "", "scope": {"type": "pilot", "id": None, "settlementIds": None},
            "seed": 1212, "parent": None, "createdAt": "2026-11-22T00:00:00+00:00", "snapshotSeq": 1, "eventSeq": 0}
    (folder / "scenario.json").write_text(json.dumps(meta))
    (folder / "state.json").write_text(json.dumps(state))
    (folder / "events.json").write_text("[]")
    snap_meta = {"id": "snap-001", "label": "Old", "date": state["date"], "checksum": checksum(state), "createdAt": ""}
    (folder / "snapshots" / "snap-001.json").write_text(json.dumps({"meta": snap_meta, "state": state}))
    return folder


def test_v1_scenarios_and_snapshots_migrate_to_one_atomic_bundle(fresh_model):
    root = fresh_model.config.root / fresh_model.config.simulation["storage"]
    folder = _write_legacy(root, fresh_model)
    manager = ScenarioManager(fresh_model)
    session = manager.session("legacy")
    assert session.state.schemaVersion == 2 and session.read_only is None
    assert session.events[-1].kind == "migrated"
    bundle = json.loads((folder / "scenario.json").read_text())
    assert bundle["formatVersion"] == 2 and set(bundle) == {"formatVersion", "meta", "state", "events"}
    assert not (folder / "state.json").exists() and not (folder / "events.json").exists()
    restored = manager.restore("legacy", "snap-001")  # an FNV-checksummed v1 snapshot still verifies and upgrades
    assert restored.state.settlements[0].society.businesses
    manager.step("legacy", 30)
    assert ScenarioManager(fresh_model).session("legacy").state.date.day == 30


def test_scenarios_from_another_source_map_are_read_only(fresh_model):
    root = fresh_model.config.root / fresh_model.config.simulation["storage"]
    folder = _write_legacy(root, fresh_model, fingerprint="sha256:" + "0" * 64)
    before = (folder / "state.json").read_text()
    manager = ScenarioManager(fresh_model)
    session = manager.session("legacy")
    assert session.read_only and manager.status(session)["readOnly"]

    async def attempts():
        for call in (lambda: manager.step("legacy", 1), lambda: manager.run("legacy", 1),
                     lambda: manager.snapshot("legacy", "x"), lambda: manager.restore("legacy", "snap-001"),
                     lambda: manager.create(CreateScenario(name="b", fromScenarioId="legacy", fromSnapshotId="snap-001"))):
            with pytest.raises(ApiError) as caught:
                call()
            assert caught.value.code == "read_only"
        await manager.pause("legacy")  # allowed, and must not write

    asyncio.run(attempts())
    assert (folder / "state.json").read_text() == before, "read-only scenarios are never rewritten"


def test_newer_schema_is_reported_not_loaded(fresh_model):
    root = fresh_model.config.root / fresh_model.config.simulation["storage"]
    _write_legacy(root, fresh_model, schema=99)
    manager = ScenarioManager(fresh_model)
    assert "legacy" in manager.unloadable and "legacy" not in manager.sessions
    assert "baseline-pilot" not in manager.sessions, "no baseline is invented over unreadable data"


def test_state_files_are_compact_json(fresh_model):
    ScenarioManager(fresh_model)
    root = fresh_model.config.root / fresh_model.config.simulation["storage"]
    raw = (root / "baseline-pilot" / "scenario.json").read_text()
    assert raw == compact_json(json.loads(raw))


def test_business_endpoint_searches_and_pages(fresh_model):
    with TestClient(create_app(dataclasses.replace(fresh_model))) as client:
        res = client.get("/api/scenarios/baseline-pilot/businesses", params={"q": "arms", "pageSize": 5}).json()
        assert res["data"] and all("Arms" in b["name"] for b in res["data"])
        farms = client.get("/api/scenarios/baseline-pilot/businesses",
                           params={"settlement": "settlement:azgaar-burg:60", "sector": "agriculture", "pageSize": 200}).json()
        total = farms["meta"]["page"]["totalItems"]
        rest = client.get("/api/scenarios/baseline-pilot/businesses",
                          params={"settlement": "settlement:azgaar-burg:60", "sector": "agriculture", "pageSize": 200, "page": 2}).json()
        assert len(farms["data"]) + len(rest["data"]) == total > 200, "pages partition the filtered list"
        assert all(b["settlementId"] == "settlement:azgaar-burg:60" and b["sector"] == "agriculture" for b in farms["data"])
        assert client.get("/api/scenarios/baseline-pilot/businesses", params={"pageSize": 999}).status_code == 400
        one = res["data"][0]
        detail = client.get(f"/api/scenarios/baseline-pilot/businesses/{one['id']}").json()["data"]
        assert detail["id"] == one["id"] and detail["settlementName"] == "Falanenerwin"
        assert client.get("/api/scenarios/baseline-pilot/businesses/business:none").status_code == 404
