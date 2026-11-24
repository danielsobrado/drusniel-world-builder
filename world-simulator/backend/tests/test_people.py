"""PR5 acceptance: persistent named people, kept to the NPC budget, living through the simulation."""

import json
from collections import Counter

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.canonical import compact_json
from world_sim.simulation.contracts import STATE_SCHEMA_VERSION, ScenarioState
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.migrations import migrate_state
from world_sim.simulation.people.checks import check_cast
from world_sim.simulation.people.generate import age_years
from world_sim.simulation.rules import ready


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def test_the_cast_matches_the_npc_budget_and_the_settlements(eldara):
    state = pilot(eldara)
    cast = state.cast
    counts = Counter(p.settlementId for p in cast.people)
    assert {eldara.settlements_by_id[s]["name"]: n for s, n in counts.items()} == {"Falanenerwin": 18, "Sshanderi": 27, "Vhaltha": 41}
    people = ready(eldara.config.rules)["simulation"]["people"]
    assert check_cast(cast, state.settlements, state.trade, people) == []
    ids = [p.id for p in cast.people]
    assert len(ids) == len(set(ids)) and all(i.startswith("npc:") for i in ids)
    traders = {t.id: t for t in state.trade.traders}
    for p in cast.people:
        age = age_years(p, 0, people)
        assert (p.role == "child") == (age < 15)
        assert len(p.name) <= 9 and p.name.isalpha()
        if p.role == "trader":
            assert traders[p.traderId].name == p.name and traders[p.traderId].personality == p.personality and age >= 22
    by_business = {b.id: b for s in state.settlements for b in s.society.businesses}
    workers = [p for p in cast.people if p.role == "worker"]
    assert workers and all(by_business[p.businessId].profession == p.profession for p in workers)
    households = Counter(p.householdId for p in cast.people)
    assert max(households.values()) >= 3, "families, not just singles"


def test_a_decade_keeps_the_budget_and_tells_life_stories(eldara):
    state, months = advance(pilot(eldara), 3600, eldara.config.rules)
    cast = state.cast
    assert check_cast(cast, state.settlements, state.trade, ready(eldara.config.rules)["simulation"]["people"]) == []
    alive = sum(p.alive for p in cast.people)
    assert cast.deaths > 5 and cast.births + cast.arrivals - cast.deaths == alive - 86, "every named life is accounted for"
    assert 86 <= alive <= 86 * (1 + eldara.config.simulation["people"]["maxOverBudget"])
    kinds = Counter(e.kind for p in cast.people for e in p.events)
    assert {"died", "came-of-age", "hired"} <= set(kinds)
    assert {"born", "arrived"} & set(kinds)
    dead = [p for p in cast.people if not p.alive]
    assert all(p.deathDay and p.events[-1].kind == "died" for p in dead)
    assert sum(1 for m in months for i in m["incidents"] if i["kind"] == "died") == cast.deaths


def test_the_idle_and_dishonest_take_to_the_road(eldara):
    state = pilot(eldara)
    road = state.trade.routes[0]
    # Make one Falanenerwin/Sshanderi adult a long-idle, greedy, dishonest person on a road with bandits.
    person = next(p for p in state.cast.people if p.settlementId == road.settlementId and p.role == "worker")
    person = person.model_copy(update={"role": "unemployed", "businessId": None, "profession": None, "idleMonths": 12,
                                       "personality": person.personality.model_copy(update={"greed": 0.95, "honesty": 0.05})})
    routes = [road.model_copy(update={"bandits": 30}), *state.trade.routes[1:]]
    cast = state.cast.model_copy(update={"people": [person if p.id == person.id else p for p in state.cast.people]})
    state = state.model_copy(update={"cast": cast, "trade": state.trade.model_copy(update={"routes": routes})})
    state, months = advance(state, 720, eldara.config.rules)
    after = next(p for p in state.cast.people if p.id == person.id)
    assert "outlaw" in {e.kind for e in after.events}
    assert any(i["kind"] == "outlaw" and i["person"] == person.id for m in months for i in m["incidents"])


def test_a_new_master_is_taken_on_from_the_towns_people(eldara):
    state = pilot(eldara)
    first = state.trade.traders[0]
    traders = [first.model_copy(update={"active": False, "dismissedDay": 0}), *state.trade.traders[1:]]
    import random

    from world_sim.simulation.economy.roads import new_trader
    replacement = new_trader("npc:trader:99", "Reserve", first.settlementId, first.settlementName, first.routeId,
                             random.Random(1), eldara.config.economy)
    trade = state.trade.model_copy(update={"traders": [*traders, replacement], "traderSeq": 99})
    state, _ = advance(state.model_copy(update={"trade": trade}), 30, eldara.config.rules)
    holder = next(p for p in state.cast.people if p.traderId == "npc:trader:99")
    assert holder.settlementId == first.settlementId and holder.role == "trader"
    master = next(t for t in state.trade.traders if t.id == "npc:trader:99")
    assert master.name == holder.name and master.personality == holder.personality
    former = next(p for p in state.cast.people if p.events and any(e.kind == "dismissed" for e in p.events))
    assert former.role == "unemployed" and former.traderId is None


def test_people_round_trip_and_v4_saves_gain_a_cast(eldara):
    state, _ = advance(pilot(eldara), 360, eldara.config.rules)
    assert state_checksum(ScenarioState(**json.loads(compact_json(state.model_dump())))) == state_checksum(state)
    raw = pilot(eldara).model_dump()
    raw["schemaVersion"] = 4
    del raw["cast"]
    migrated, stored = migrate_state(raw, eldara)
    assert stored == 4 and migrated.schemaVersion == STATE_SCHEMA_VERSION and len(migrated.cast.people) == 86


def test_people_endpoints(fresh_model):
    client = TestClient(create_app(fresh_model))
    client.post("/api/scenarios/baseline-pilot/step", json={"unit": "year"})
    page = client.get("/api/scenarios/baseline-pilot/people?pageSize=10&role=worker").json()
    assert len(page["data"]) == 10 and page["meta"]["page"]["totalItems"] > 10
    assert all(p["role"] == "worker" and "age" in p and p["workplace"] for p in page["data"])
    one = page["data"][0]
    detail = client.get(f"/api/scenarios/baseline-pilot/people/{one['id']}").json()["data"]
    assert detail["settlementName"] and detail["household"]["members"] and detail["events"]
    assert client.get("/api/scenarios/baseline-pilot/people/npc:0:0").status_code == 404
    workers = client.get(f"/api/scenarios/baseline-pilot/businesses/{one['businessId']}").json()["data"]["workers"]
    assert any(w["id"] == one["id"] for w in workers)
