from urllib.parse import quote

import pytest
from fastapi.testclient import TestClient

from world_sim.api.app import create_app

ENDPOINTS = ["/api/health", "/api/world", "/api/world/summary", "/api/world/settlements", "/api/world/connectivity",
             "/api/world/npc-budget", "/api/world/pilot"]


@pytest.fixture(scope="module")
def client(eldara):
    return TestClient(create_app(eldara))


@pytest.mark.parametrize("path", ENDPOINTS)
def test_every_endpoint_returns_the_versioned_envelope(client, path):
    res = client.get(path)
    assert res.status_code == 200
    body = res.json()
    assert body["apiVersion"] == 1
    assert body["world"]["mapId"] == "eldara-2026"
    assert body["world"]["sourceFingerprint"].startswith("sha256:")
    assert body["data"]


def test_summary_and_world_expose_real_counts_without_paths(client):
    assert client.get("/api/world/summary").json()["data"]["counts"]["settlements"] == 502
    assert client.get("/api/world/summary").json()["data"]["npcBudget"]["allocated"] == 10040
    world = client.get("/api/world")
    assert len(world.json()["data"]["markers"]) == 502
    assert "../maps" not in world.text and ":\\\\" not in world.text


def test_settlement_list_paginates_filters_and_sorts(client):
    page = client.get("/api/world/settlements", params={"pageSize": 100, "page": 6}).json()
    assert page["meta"]["page"] == {"page": 6, "pageSize": 100, "totalItems": 502, "totalPages": 6}
    assert len(page["data"]) == 2

    capitals = client.get("/api/world/settlements", params={"capital": "true", "sort": "population", "order": "desc"}).json()["data"]
    assert len(capitals) == 8
    assert [c["population"] for c in capitals] == sorted((c["population"] for c in capitals), reverse=True)

    villages = client.get("/api/world/settlements", params={"class": "named-village", "maxPopulation": 800, "pageSize": 200}).json()["data"]
    assert villages and all(v["class"] == "named-village" and v["population"] <= 800 for v in villages)

    search = client.get("/api/world/settlements", params={"q": "vhal"}).json()["data"]
    assert [s["name"] for s in search] == ["Vhaltha"]
    state = client.get("/api/world/settlements", params={"state": search[0]["stateId"], "pageSize": 200}).json()["data"]
    assert all(s["stateId"] == search[0]["stateId"] for s in state)


@pytest.mark.parametrize("query", ["page=0", "pageSize=1000", "sort=secret", "order=up", "capital=yes", "class=castle",
                                   "minPopulation=10&maxPopulation=5", "path=../x", "page=abc"])
def test_invalid_parameters_return_400_naming_the_parameter(client, query):
    res = client.get(f"/api/world/settlements?{query}")
    assert res.status_code == 400
    assert res.json()["error"]["code"] == "invalid_parameter"
    assert res.json()["error"]["details"]["parameter"]


def test_settlement_detail_by_stable_or_source_id(client):
    detail = client.get(f"/api/world/settlements/{quote('settlement:azgaar-burg:238', safe='')}").json()["data"]
    assert detail["name"] == "Vhaltha" and detail["pilot"] is True
    assert detail["connectivity"]["roadLinks"]
    assert client.get("/api/world/settlements/238").json()["data"]["id"] == "settlement:azgaar-burg:238"
    missing = client.get("/api/world/settlements/99999")
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "not_found"


def test_the_world_api_is_read_only_and_has_no_file_endpoints(client):
    assert client.post("/api/world", json={}).status_code == 405
    assert client.post("/api/world").status_code == 415, "writes without a JSON body are refused before routing"
    assert client.get("/api/files/..%2F..%2Fpackage.json").status_code == 404
    assert client.get("/index.html").status_code == 404, "no static serving unless enabled"
