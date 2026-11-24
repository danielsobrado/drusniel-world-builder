import asyncio

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.engine import advance, advance_frames, baseline_state, state_checksum
from world_sim.simulation.interventions import Intervention
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
    town = next(s for s in session.state.settlements if s.name == "Sshanderi")
    employers = {p.businessId for p in session.state.cast.people if p.settlementId == town.settlementId and p.role == "worker"}
    opportunities = sorted(town.society.businesses, key=lambda b: (b.id not in employers, -b.staff, b.id))
    lost = 0
    for business in opportunities:
        manager.intervene(session.meta.id, Intervention(kind="disaster", businessId=business.id))
        lost += business.filled
        if lost >= 700:
            break
    manager.step(session.meta.id, 30)

    assert session.state.travel.population > 0
    before = session.checksum
    snapshot = manager.snapshot(session.meta.id, "Departing parties")
    manager.step(session.meta.id, 5)
    manager.restore(session.meta.id, snapshot.id)
    assert session.checksum == before
    for year in range(5):
        manager.step(session.meta.id, 330 if year == 0 else 360)
        state = session.state
        resident = sum(s.population for s in state.settlements)
        people = resident + sum(j.population for j in state.travel.journeys if j.active)
        deaths = sum(s.deaths for s in state.settlements)
        births = sum(s.births for s in state.settlements)
        assert people == initial + births - deaths
    assert state.date.day == 1800
    finished = [j for j in state.travel.journeys if j.status == "arrived" and j.personIds]
    assert finished
    journey = finished[0]
    route = next(r for r in state.travel.routes if r.id == journey.routeId)
    assert {route.fromId, route.toId} == {journey.originId, journey.destinationId}
    events = manager.archive(session.meta.id).query(person=journey.personIds[0], limit=None)
    trace = {e.kind: e.day for e in events if e.facts.get("journeyId") == journey.id}
    assert trace["departed"] == journey.departDay and trace["moved"] == journey.arriveDay
    assert journey.departDay < journey.arriveDay
    from world_sim.simulation.lab import Lab

    assert Lab(manager).validate(session.meta.id)["passed"]
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
        route = data["routes"][0]
        detail = client.get(f"/api/scenarios/baseline-pilot/travel/{route['id']}")
        assert detail.json()["data"]["item"] == route
        assert client.get("/api/scenarios/baseline-pilot/travel/unknown").status_code == 404



def test_migration_remains_in_transit_during_closure_and_returns_if_full(eldara):
    from world_sim.simulation.migration import TravelDay
    from world_sim.simulation.rules import ready

    rules = ready(eldara.config.rules)
    rules["simulation"]["travel"] = {**rules["simulation"]["travel"], "closureChance": 1}
    state = pilot(eldara, rules)
    original, *others = state.settlements
    economy = original.society.employment
    idle = economy.model_copy(update={"unemployed": economy.labourSupply // 2})
    origin = original.model_copy(update={"society": original.society.model_copy(update={"employment": idle})})
    trip = TravelDay(state.travel, [origin, *others], state.cast, state.trade, rules, state.seed, 30)
    trip.dispatch()
    [party] = trip.state.journeys
    destination = trip.towns[party.destinationId]
    road = trip.routes[party.routeId]
    host = trip.towns[party.destinationId]
    occupied = [h.model_copy(update={"vacant": 0}) for h in host.society.housing]
    trip.towns[party.destinationId] = host.model_copy(update={"society": host.society.model_copy(update={"housing": occupied})})
    trip.day = party.departDay + road.days // 2
    trip.tick()
    [delayed] = trip.state.journeys
    assert delayed.status == "delayed" and delayed.arriveDay == party.arriveDay + 3
    assert trip.towns[party.destinationId].population == destination.population
    assert sum(t.population for t in trip.result()) + trip.state.population == sum(t.population for t in state.settlements)
    trip.day = delayed.arriveDay
    trip.tick()
    [returning] = trip.state.journeys
    assert returning.status == "returning"
    trip.day = returning.arriveDay
    trip.tick()
    assert trip.state.journeys[0].status == "returned" and trip.state.population == 0
    assert trip.towns[origin.settlementId].ancestries == origin.ancestries


@pytest.mark.parametrize("kind", ["road", "sea"])
def test_paths_never_connect_isolated_towns_by_proximity(eldara, kind):
    from world_sim.geography.paths import RoutePlanner

    available = eldara.connectivity["landGraph"] if kind == "road" else eldara.connectivity["seaGraph"]
    other = next(t for t in eldara.audit["settlements"] if t["cell"] not in available and not t["port"]
                 and t["cell"] not in eldara.connectivity["landGraph"])
    origin = eldara.settlements_by_id[next(iter(sorted(eldara.pilot_ids)))]
    planner = RoutePlanner(eldara, eldara.config.economy["caravans"])
    assert planner.route(origin, other) is None


def test_carried_report_from_previous_week_reaches_host_on_arrival(fresh_model):
    manager = ScenarioManager(fresh_model)
    session = manager.session("baseline-pilot")
    origin = next(s for s in session.state.settlements if s.name == "Falanenerwin")
    event = manager.intervene(session.meta.id, Intervention(kind="granary-loss", settlementId=origin.settlementId))[0]
    manager.step(session.meta.id, 30)
    convoy = next(c for c in session.state.trade.caravans if c.fromId == origin.settlementId and c.kind == "sale")
    assert event.id in convoy.news
    state, _ = advance_frames(session.state, convoy.arriveDay - 31, manager.rules(session))
    assert event.id not in state.travel.news.get(convoy.toId, [])
    at_port, _ = advance_frames(state, 1, manager.rules(session))
    assert event.id in at_port.travel.news.get(convoy.toId, [])
    master = next(p for p in at_port.cast.people if p.id == convoy.carrierId)
    assert master.visited[convoy.toId] == convoy.arriveDay



def test_offroad_commerce_requires_a_connected_dry_cell_path():
    from types import SimpleNamespace

    from world_sim.geography.paths import RoutePlanner

    cells = [{"i": i, "p": list(point), "h": height, "c": neighbors}
             for i, (point, height, neighbors) in enumerate([((0, 0), 30, [1]), ((12, 7), 80, [0, 2]), ((24, 0), 35, [1])])]
    model = SimpleNamespace(connectivity={"cellPositions": {}, "edgeSources": {}, "distanceUnit": "mi",
                                         "distanceScale": 1, "landGraph": {}, "seaGraph": {}},
                            document={"pack": {"cells": cells}}, audit={"settlements": []})
    settings = {"milesPerDay": 12, "shipMilesPerDay": 60, "offRoadFactor": 1.5}
    a = {"x": 0, "y": 0, "cell": 0, "id": "a", "sourceId": 1}
    b = {"x": 24, "y": 0, "cell": 2, "id": "b", "sourceId": 2}
    path = RoutePlanner(model, settings).route(a, b, off_road=True)
    assert path and path.mode == "off-road" and (12, 7) in path.points and path.days > 2
    cells[1]["h"] = 15
    assert RoutePlanner(model, settings).route(a, b, off_road=True) is None
