import time

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app


@pytest.fixture
def client(fresh_model):
    with TestClient(create_app(fresh_model)) as c:
        yield c


def data(res, status=200):
    assert res.status_code == status, res.text
    return res.json()["data"]


def test_scenario_lifecycle_over_http(client):
    config = data(client.get("/api/simulation"))
    assert config["startYear"] == 1212 and config["stepSizes"]["month"] == 30

    [baseline] = data(client.get("/api/scenarios"))
    assert baseline["id"] == "baseline-pilot" and baseline["date"]["label"] == "1212-01-01"
    assert baseline["population"] == 6256 + 8560 + 15747

    stepped = data(client.post("/api/scenarios/baseline-pilot/step", json={"unit": "year"}))
    assert stepped["date"]["label"] == "1213-01-01"
    state = data(client.get("/api/scenarios/baseline-pilot/state"))
    assert state["schemaVersion"] == 6 and len(state["history"]) == 13
    assert [e["kind"] for e in data(client.get("/api/scenarios/baseline-pilot/events?limit=2"))] == ["stepped", "month"]

    snap = data(client.post("/api/scenarios/baseline-pilot/snapshots", json={"label": "Year one"}), 201)
    assert [s["id"] for s in data(client.get("/api/scenarios/baseline-pilot/snapshots"))] == [snap["id"]]
    branch = data(client.post("/api/scenarios", json={"name": "Year one branch", "fromScenarioId": "baseline-pilot",
                                                      "fromSnapshotId": snap["id"]}), 201)
    assert branch["parent"] == {"scenarioId": "baseline-pilot", "snapshotId": snap["id"]}
    restored = data(client.post("/api/scenarios/baseline-pilot/restore", json={"snapshotId": snap["id"]}))
    assert restored["checksum"] == snap["checksum"]


def test_create_by_state_scope(client):
    vhaltha = data(client.get("/api/world/settlements/238"))
    created = data(client.post("/api/scenarios", json={"name": "Umbra'kor", "scope": {"type": "state", "id": vhaltha["stateId"]}}), 201)
    assert created["id"] == "umbra-kor" and len(created["settlementIds"]) == 62


def test_run_and_pause_over_http(client):
    data(client.post("/api/scenarios/baseline-pilot/run", json={"speed": 120}))
    assert data(client.get("/api/scenarios/baseline-pilot"))["running"] is True
    assert client.post("/api/scenarios/baseline-pilot/step", json={"days": 1}).status_code == 409
    time.sleep(0.6)
    paused = data(client.post("/api/scenarios/baseline-pilot/pause", json={}))
    assert paused["running"] is False and paused["date"]["day"] >= 30


@pytest.mark.parametrize(("path", "body", "status", "code"), [
    ("/api/scenarios/baseline-pilot/step", {"days": 3, "unit": "day"}, 400, "invalid_parameter"),
    ("/api/scenarios/baseline-pilot/step", {"unit": "decade"}, 400, "invalid_parameter"),
    ("/api/scenarios/baseline-pilot/step", {"days": 0}, 400, "invalid_parameter"),
    ("/api/scenarios/baseline-pilot/run", {"speed": 5}, 400, "invalid_parameter"),
    ("/api/scenarios/missing/step", {"days": 1}, 404, "not_found"),
    ("/api/scenarios/baseline-pilot/restore", {"snapshotId": "snap-404"}, 404, "not_found"),
    ("/api/scenarios/baseline-pilot/restore", {"snapshotId": "../../etc"}, 404, "not_found"),
    ("/api/scenarios", {"name": ""}, 400, "invalid_parameter"),
    ("/api/scenarios", {"name": "x", "scope": {"type": "planet"}}, 400, "invalid_parameter"),
    ("/api/scenarios", {"name": "x", "extra": 1}, 400, "invalid_parameter"),
])
def test_invalid_scenario_requests(client, path, body, status, code):
    res = client.post(path, json=body)
    assert res.status_code == status, res.text
    assert res.json()["error"]["code"] == code


def test_writes_must_be_json(client):
    res = client.post("/api/scenarios/baseline-pilot/step", content='{"days": 1}', headers={"content-type": "text/plain"})
    assert res.status_code == 415
