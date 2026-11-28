import asyncio
from dataclasses import replace

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.contracts import STATE_SCHEMA_VERSION, CreateScenario, Scope
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.migrations import migrate_state


def test_astalor_canonical_identity_and_seed_boundaries(astalor):
    # Crild (wetland), Khunzad (highland), Thaquasadi (forest), Vhaltha (Umbra'kori).
    ids = [f"settlement:azgaar-burg:{i}" for i in (426, 345, 213, 238)]
    state = baseline_state(astalor, scenario_id="peoples", settlement_ids=ids, seed=42, start_year=1212)
    goblin, vondari, elenori, umbra = state.settlements
    assert goblin.identity.cultureId is None and goblin.identity.cultureSeedId == "goblin-peoples"
    assert set(goblin.ancestries) == {"goblin"}
    assert goblin.ancestries["goblin"].total == goblin.population
    assert all(p.identity.ancestryId == "goblin" for p in state.cast.people if p.settlementId == goblin.settlementId)
    assert {entry.assetId for entry in goblin.infrastructure} == {"grukmar/raised-marsh-boardwalk", "grukmar/bog-stilt-dwelling"}
    assert [s.identity.cultureId for s in (vondari, elenori, umbra)] == ["vondari", "elenori", "umbra-kori"]
    assert all(sum(c.total for c in s.ancestries.values()) == s.population for s in state.settlements)
    after, _ = advance(state, 120, astalor.config.rules)
    assert all(sum(c.total for c in s.ancestries.values()) == s.population for s in after.settlements)
    assert state_checksum(after) == state_checksum(advance(state, 120, astalor.config.rules)[0])
    split = advance(advance(state, 30, astalor.config.rules)[0], 90, astalor.config.rules)[0]
    assert state_checksum(after) == state_checksum(split)


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
    assert asyncio.run(manager.replay(session.meta.id))["matches"]


def test_unmapped_map_and_v7_migration_preserve_character_records(astalor):
    foreign = replace(astalor, audit={**astalor.audit, "identity": {**astalor.audit["identity"], "mapId": "another-map"}})
    sid = astalor.pilot["roles"][0]["settlementId"]
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
    assert version == 7 and upgraded.schemaVersion == STATE_SCHEMA_VERSION
    assert upgraded.cast.households == neutral.cast.households
    for migrated, original in zip(upgraded.cast.people, neutral.cast.people, strict=True):
        assert migrated.model_dump(exclude={"upbringing"}) == original.model_dump(exclude={"upbringing"})
        assert migrated.upbringing.settlementId == original.birthplaceId


def test_v7_migration_uses_recorded_birthplace_for_upbringing(astalor):
    origin = "settlement:azgaar-burg:345"
    birthplace = "settlement:azgaar-burg:213"
    baseline = baseline_state(astalor, scenario_id="birthplace-migration",
                              settlement_ids=[origin, birthplace], seed=7, start_year=1212)
    raw = baseline.model_dump()
    raw["schemaVersion"] = 7
    for settlement in raw["settlements"]:
        del settlement["identity"], settlement["ancestries"]
    original = next(p for p in raw["cast"]["people"] if p["settlementId"] == origin)
    original["birthplaceId"] = birthplace
    for person in raw["cast"]["people"]:
        del person["identity"], person["upbringing"]

    migrated, stored = migrate_state(raw, astalor)
    updated = next(p for p in migrated.cast.people if p.id == original["id"])
    home = next(s for s in baseline.settlements if s.settlementId == origin)
    assert stored == 7
    assert updated.birthplaceId == birthplace
    assert updated.upbringing.settlementId == birthplace
    assert updated.upbringing.cultureId == "elenori"
    assert updated.identity.cultureId == "elenori"
    assert updated.identity.polityId == home.identity.polityId


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


def test_ancestry_parameters_drive_births_ages_and_food_without_altering_ancestry(astalor):
    from world_sim.peoples.assignments import assigned_rules
    from world_sim.peoples.contracts import Assignment
    from world_sim.simulation.people.generate import age_years
    from world_sim.simulation.rules import ready

    sid = astalor.pilot["roles"][0]["settlementId"]
    rules = assigned_rules(astalor.config.rules, {sid: Assignment(cultureId="vondari", ancestryWeights={"goblin": 1})}, [sid])
    peoples = rules["peoples"]
    ancestry = {**peoples["ancestries"]["goblin"], "ages": {"child": [0, 9], "adult": [10, 34], "elder": [35, 60]},
                "birthsPerAdultPerYear": 0, "foodMultiplier": 2}
    experimental = {**rules, "peoples": {**peoples, "ancestries": {**peoples["ancestries"], "goblin": ancestry}}}
    args = {"scenario_id": "demography", "settlement_ids": [sid], "seed": 42, "start_year": 1212}
    base = baseline_state(astalor, **args, rules=rules)
    state = baseline_state(astalor, **args, rules=experimental)
    assert state.settlements[0].economy.food.wanted == base.settlements[0].economy.food.wanted * 2
    people_cfg = ready(experimental)["simulation"]["people"]
    assert all(age_years(p, 0, people_cfg) < 10 for p in state.cast.people if p.role == "child")
    after, _ = advance(state, 30, experimental)
    assert after.settlements[0].births == 0
    assert after.settlements[0].ancestries["goblin"] == after.settlements[0].cohorts


def test_an_affordable_exclusive_patron_can_outweigh_a_preference_for_diversification():
    from world_sim.peoples.decisions import SCENARIOS, rank

    weights = {"autonomy": 0.7, "continuity": 0.1}
    assert rank(SCENARIOS["trade"], weights)[0]["id"] == "diversify-partners"
    assert rank(SCENARIOS["trade"], weights, urgency=1)[0]["id"] == "exclusive-patron"


def test_named_migrant_retains_upbringing_and_ancestry_and_takes_local_polity(astalor):
    from world_sim.peoples.assignments import assigned_rules
    from world_sim.peoples.contracts import Assignment
    from world_sim.simulation.contracts import Cohorts, Journey
    from world_sim.simulation.people.journeys import embark, settle
    from world_sim.simulation.rules import ready

    origin, destination = [role["settlementId"] for role in astalor.pilot["roles"][:2]]
    rules = assigned_rules(astalor.config.rules, {
        origin: Assignment(cultureId="vondari", polityId="home", ancestryWeights={"goblin": 1}),
        destination: Assignment(cultureId="elenori", polityId="host", ancestryWeights={"elf": 1}),
    }, [origin, destination])
    state = baseline_state(astalor, scenario_id="movement", settlement_ids=[origin, destination], seed=42, start_year=1212, rules=rules)
    person = next(p for p in state.cast.people if p.settlementId == origin and p.role == "worker")
    person = person.model_copy(update={"role": "unemployed", "businessId": None, "profession": None,
                                       "personality": person.personality.model_copy(update={"greed": 1.0, "caution": 0.0})})
    cfg = ready(rules)["simulation"]["people"]
    cfg = {**cfg, "moveScale": 1000, "cultureProfiles": {}}
    origin_state, host_state = state.settlements
    cast = state.cast.model_copy(update={"people": [person]})
    journey = Journey(id="journey:1", routeId=state.travel.routes[0].id, originId=origin, destinationId=destination,
                      reason="work", departDay=30, arriveDay=45, householdSlots=1,
                      ancestries={"goblin": Cohorts(children=0, adults=1, elders=0)})
    cast, people = embark(cast, journey, origin_state, host_state, seed=42, cfg=cfg, reserved=0, distance_days=15, risk=0)
    [traveling] = cast.people
    assert traveling.journeyId == journey.id and traveling.settlementId == origin
    [moved] = settle(cast, journey.model_copy(update={"personIds": people}), host_state, 42).people
    assert moved.settlementId == destination
    assert moved.identity.ancestryId == "goblin"
    assert moved.identity.polityId == "host" and moved.identity.cultureId == "vondari"
    assert moved.upbringing == person.upbringing



def test_live_job_choices_follow_upbringing_with_ancestry_held_fixed(astalor):
    import random

    from world_sim.peoples.contracts import CivicIdentity, Identity, Upbringing
    from world_sim.simulation.contracts import Business
    from world_sim.simulation.people.life import Month, _towns, _work
    from world_sim.simulation.people.relationships import Ties
    from world_sim.simulation.rules import ready

    sid = astalor.pilot["roles"][0]["settlementId"]
    rules = ready(astalor.config.rules)
    state = baseline_state(astalor, scenario_id="work", settlement_ids=[sid], seed=42, start_year=1212)
    settlement = state.settlements[0]
    posts = [Business(id=kind, kind=kind, sector=sector, profession=profession, settlementId=sid, name=kind, staff=1, wage=5, filled=1)
             for kind, sector, profession in (("smithy", "crafts", "smith"), ("market-stall", "trade", "merchant"))]
    society = settlement.society.model_copy(update={"businesses": posts})
    settlement = settlement.model_copy(update={"identity": CivicIdentity(), "society": society})
    person = next(p for p in state.cast.people if p.role == "worker").model_copy(
        update={"role": "unemployed", "businessId": None, "profession": None})
    cfg = {**rules["simulation"]["people"], "findWorkPerMonth": 10}

    def choose(identity, upbringing):
        candidate = person.model_copy(update={"identity": identity, "upbringing": upbringing})
        town = _towns({person.id: candidate}, [settlement], [])[sid]
        month = Month(30, 42, cfg, rules["economy"], {}, 10, Ties([], 0), {})
        return _work(candidate, town, month, random.Random(42))

    guild = choose(Identity(ancestryId="goblin", cultureId="vondari"), Upbringing(cultureId="vondari"))
    network = choose(Identity(ancestryId="goblin", cultureSeedId="goblin-peoples"), Upbringing(cultureSeedId="goblin-peoples"))
    assert guild.profession == "smith" and network.profession == "merchant"
