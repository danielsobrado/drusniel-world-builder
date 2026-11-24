import asyncio

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.manager import ScenarioManager


def pilot(model, rules=None):
    return baseline_state(model, scenario_id="travel", settlement_ids=sorted(model.pilot_ids), seed=1212,
                          start_year=1212, rules=rules)


def test_baseline_holds_continuous_imported_routes(eldara):
    state = pilot(eldara)
    network = state.travel.routes
    route = next(r for r in network if r.fromId != r.toId and len(r.points) > 2)
    assert route.sourceRouteIds
    assert route.days > 0
    assert route.points[0] == tuple(eldara.settlements_by_id[route.fromId][axis] for axis in ("x", "y"))
    assert route.points[-1] == tuple(eldara.settlements_by_id[route.toId][axis] for axis in ("x", "y"))


def test_five_year_pilot_conserves_population_and_replays(fresh_model):
    manager = ScenarioManager(fresh_model)
    session = manager.session("baseline-pilot")
    initial = sum(s.population for s in session.state.settlements)
    for _ in range(5):
        manager.step(session.meta.id, 360)
        state = session.state
        resident = sum(s.population for s in state.settlements)
        people = resident + sum(j.population for j in state.travel.journeys if j.active)
        deaths = sum(s.deaths for s in state.settlements)
        births = sum(s.births for s in state.settlements)
        assert people == initial + births - deaths
    assert asyncio.run(manager.replay(session.meta.id))["matches"]


def test_one_step_and_chunked_steps_have_the_same_journeys(eldara):
    state = pilot(eldara)
    many, _ = advance(state, 365, eldara.config.rules)
    first, _ = advance(state, 53, eldara.config.rules)
    last, _ = advance(first, 312, eldara.config.rules)
    assert many.travel.routes
    assert state_checksum(many) == state_checksum(last)


def test_travel_endpoint(fresh_model):
    with TestClient(create_app(fresh_model)) as client:
        response = client.get("/api/scenarios/baseline-pilot/travel")
        assert response.status_code == 200
        data = response.json()["data"]
        assert data["routes"] and data["populationInTransit"] == 0
