from dataclasses import replace

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.contracts import CreateScenario, Scope
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.migrations import migrate_state


def test_eldara_canonical_identity_and_seed_boundaries(eldara):
    ids = [next(s["id"] for s in eldara.audit["settlements"] if s["cultureId"] == f"culture:azgaar:{i}")
           for i in (13, 10, 1, 8)]
    state = baseline_state(eldara, scenario_id="peoples", settlement_ids=ids, seed=42, start_year=1212)
    goblin, vondari, elenori, umbra = state.settlements
    assert goblin.identity.cultureId is None and goblin.identity.cultureSeedId == "goblin-peoples"
    assert [s.identity.cultureId for s in (vondari, elenori, umbra)] == ["vondari", "elenori", "umbra-kori"]
    assert all(sum(c.total for c in s.ancestries.values()) == s.population for s in state.settlements)
    after, _ = advance(state, 120, eldara.config.rules)
    assert all(sum(c.total for c in s.ancestries.values()) == s.population for s in after.settlements)
    assert state_checksum(after) == state_checksum(advance(state, 120, eldara.config.rules)[0])


def test_explicit_mixed_assignment_survives_replay_and_snapshot(fresh_model):
    manager = ScenarioManager(fresh_model)
    sid = fresh_model.pilot["roles"][0]["settlementId"]
    req = CreateScenario(name="Mixed", scope=Scope(type="settlements", settlementIds=[sid]),
                         peoples={sid: {"cultureId": "vondari", "ancestryWeights": {"goblin": 1}}})
    session = manager.create(req)
    for person in session.state.cast.people:
        assert person.identity.ancestryId == "goblin"
        assert person.identity.cultureId == person.upbringing.cultureId == "vondari"
    snapshot = manager.snapshot(session.meta.id, "Mixed population")
    manager.step(session.meta.id, 30)
    manager.restore(session.meta.id, snapshot.id)
    reloaded = ScenarioManager(fresh_model).session(session.meta.id)
    assert reloaded.checksum == session.checksum
    from world_sim.simulation.lab import Lab
    assert Lab(manager).validate(session.meta.id)["replay"]["status"] == "verified"


def test_unmapped_map_and_v7_migration_preserve_character_records(eldara):
    foreign = replace(eldara, audit={**eldara.audit, "identity": {**eldara.audit["identity"], "mapId": "another-map"}})
    sid = eldara.pilot["roles"][0]["settlementId"]
    neutral = baseline_state(foreign, scenario_id="old", settlement_ids=[sid], seed=5, start_year=1212)
    assert neutral.settlements[0].identity.cultureId is None
    assert set(neutral.settlements[0].ancestries) == {"unspecified"}
    raw = neutral.model_dump()
    raw["schemaVersion"] = 7
    for s in raw["settlements"]:
        del s["identity"], s["ancestries"]
    for p in raw["cast"]["people"]:
        del p["identity"], p["upbringing"]
    upgraded, version = migrate_state(raw, foreign)
    assert version == 7 and upgraded.schemaVersion == 8
    assert upgraded.cast.households == neutral.cast.households
    assert upgraded.cast.people == neutral.cast.people


def test_peoples_api_compares_identical_opportunities_and_shows_provenance(fresh_model):
    with TestClient(create_app(fresh_model)) as client:
        response = client.get("/api/scenarios/baseline-pilot/peoples")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["cultures"]["vondari"]["status"] == "core"
        assert data["cultures"]["goblin-peoples"]["status"] == "seed"
        assert sum(s["population"] for s in data["settlements"]) > 0
        response = client.get("/api/scenarios/baseline-pilot/peoples/compare?left=goblin-peoples&right=vondari&scenario=trade")
        assert response.status_code == 200
        compared = response.json()["data"]
        assert compared["left"]["choice"] != compared["right"]["choice"]
        assert compared["left"]["status"] == "experimental"
        invalid = client.post("/api/scenarios", json={"name": "Unknown", "peoples": {
            fresh_model.pilot["roles"][0]["settlementId"]: {"cultureId": "grukmar-caravan-goblins"}
        }})
        assert invalid.status_code == 400
