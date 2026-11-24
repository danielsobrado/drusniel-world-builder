"""PR9: the versioned game export of a scenario's named people."""

import json

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.narration.draft import DraftWriter

BASE = "/api/scenarios/baseline-pilot"


def test_the_export_lists_each_town_and_its_people_with_stable_ids(fresh_model, tmp_path, monkeypatch):
    monkeypatch.setitem(fresh_model.config.simulator["gameExport"], "directory", str(tmp_path / "world-sim"))
    with TestClient(create_app(fresh_model, provider=DraftWriter())) as client:
        client.post(f"{BASE}/step", json={"days": 90})
        preview = client.get(f"{BASE}/export/game").json()["data"]
        index, files = preview["index"], preview["files"]
        assert index["schema"] == "drusniel-world-sim-game-export" and index["version"] == 1
        assert {s["sourceId"] for s in index["settlements"]} == {60, 113, 238}
        state = client.app.state.scenarios.session("baseline-pilot").state
        for entry in index["settlements"]:
            doc = files[entry["file"]]
            assert doc["settlementId"] == f"settlement:azgaar-burg:{entry['sourceId']}"
            expected = {p.id for p in state.cast.people if p.alive and p.settlementId == doc["settlementId"]
                        and p.role not in ("outlaw", "imprisoned")}
            assert {r["id"] for r in doc["residents"]} == expected, "everyone in the streets, nobody on the road or in prison"
            assert all(r["introduction"]["text"] and r["name"] and r["mood"] for r in doc["residents"])
            tiers = [r["tier"] for r in doc["residents"]]
            assert tiers == sorted(tiers, key=["major", "standard", "basic"].index), "the most prominent first"

        written = client.post(f"{BASE}/export/game", json={}).json()["data"]
        on_disk = json.loads((tmp_path / "world-sim" / "index.json").read_text(encoding="utf-8"))
        assert on_disk["stateChecksum"] == written["stateChecksum"] == index["stateChecksum"]
        first = index["settlements"][0]["file"]
        assert json.loads((tmp_path / "world-sim" / first).read_text(encoding="utf-8")) == files[first]
        assert client.get(f"{BASE}/export/game").json()["data"] == preview, "the same state exports the same documents"
