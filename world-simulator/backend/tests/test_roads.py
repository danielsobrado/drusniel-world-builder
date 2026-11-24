"""Roads, bandits, caravan guards and the traders who smuggle (or don't), by their personality."""

import dataclasses
import json

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.canonical import compact_json
from world_sim.simulation.contracts import STATE_SCHEMA_VERSION, ScenarioState
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.migrations import migrate_state


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def test_roads_and_traders_start_from_the_map(eldara):
    state = pilot(eldara)
    assert {r.settlementName for r in state.trade.routes} == {"Falanenerwin", "Sshanderi"}, "the market centre needs no road"
    assert all(r.bandits == 0 and r.lair is None for r in state.trade.routes), "no Azgaar brigands near the pilot"
    assert len(state.trade.traders) == 6 and len({t.name for t in state.trade.traders}) == 6
    for t in state.trade.traders:
        assert t.name.isalpha() and t.name[0].isupper(), "names come from the culture's name base"
        assert all(0 <= v <= 1 for v in t.personality.model_dump().values())
    [market] = state.trade.markets
    assert abs(market.taxRates["Amber"] - 6.74 / (6 * 7.02)) < 1e-3, "tax rates come from Azgaar's taxed deals"


def test_a_brigands_marker_founds_a_band_that_never_dies_out(eldara):
    falanenerwin = eldara.settlements_by_id["settlement:azgaar-burg:113"]
    pack = eldara.document["pack"]
    marker = {"type": "brigands", "i": 999, "x": falanenerwin["x"] + 5, "y": falanenerwin["y"], "cell": falanenerwin["cell"]}
    document = {**eldara.document, "pack": {**pack, "markers": [*pack["markers"], marker]},
                "notes": [*eldara.document.get("notes", []), {"id": "marker999", "name": "Grey Wolves"}]}
    model = dataclasses.replace(eldara, document=document)
    state = pilot(model)
    road = next(r for r in state.trade.routes if r.settlementName == "Falanenerwin")
    assert (road.bandits, road.lair) == (24, "Grey Wolves")
    state, _ = advance(state, 1800, eldara.config.rules)
    road = next(r for r in state.trade.routes if r.settlementName == "Falanenerwin")
    assert road.bandits >= road.floor == 8 and road.raids > 0


def test_a_decade_of_bandits_guards_and_smugglers(eldara):
    state, months = advance(pilot(eldara), 3600, eldara.config.rules)
    bandits = [m["bandits"] for m in months]
    assert 0 < bandits[-1] <= 20, "bands persist on the idle a town cannot employ, but no longer grow without limit"
    assert sum(m["raids"] for m in months) > 5 and sum(m["caught"] for m in months) >= 2
    traders = state.trade.traders
    for road in state.trade.routes:
        assert sum(t.scorecard.guardsHired for t in traders if t.routeId == road.id) > 0, "escort demand becomes guard jobs"
    died = {p.traderId for p in state.cast.people if not p.alive and p.traderId}
    assert all((t.scorecard.reputation < 15 and t.scorecard.caught) or t.id in died for t in traders if not t.active), \
        "a master leaves the post only when dismissed or dead"
    assert len([t for t in traders if t.active]) == 6, "every dismissed master is replaced"
    working = [t for t in traders if t.scorecard.trips]
    reckless = min(working, key=lambda t: t.personality.caution)
    careful = max(working, key=lambda t: t.personality.caution)
    assert reckless.scorecard.guardsHired / reckless.scorecard.trips < careful.scorecard.guardsHired / careful.scorecard.trips


def test_state_round_trips_through_json_unchanged(eldara):
    state, _ = advance(pilot(eldara), 720, eldara.config.rules)
    back = ScenarioState(**json.loads(compact_json(state.model_dump())))
    assert state_checksum(back) == state_checksum(state), "snapshots verify after a save and load"


def test_v3_states_gain_roads_and_traders(eldara):
    raw = pilot(eldara).model_dump()
    raw["schemaVersion"] = 3
    for key in ("routes", "traders", "traderSeq"):
        del raw["trade"][key]
    for m in raw["trade"]["markets"]:
        del m["taxRates"], m["taxRevenue"]
    state, stored = migrate_state(raw, eldara)
    assert stored == 3 and state.schemaVersion == STATE_SCHEMA_VERSION
    assert len(state.trade.routes) == 2 and len(state.trade.traders) == 6


def test_trader_endpoint_and_incident_events(fresh_model):
    client = TestClient(create_app(fresh_model))
    client.post("/api/scenarios/baseline-pilot/step", json={"days": 1800})
    body = client.get("/api/scenarios/baseline-pilot/economy").json()["data"]
    assert len(body["routes"]) == 2 and body["traders"]
    trader = body["traders"][0]
    card = client.get(f"/api/scenarios/baseline-pilot/traders/{trader['id']}").json()["data"]
    assert card["scorecard"]["trips"] > 0 and card["route"]["id"] == trader["routeId"]
    assert all(c["traderId"] == trader["id"] for c in card["caravans"])
    assert client.get("/api/scenarios/baseline-pilot/traders/npc:trader:999").status_code == 404
    kinds = {e["kind"] for e in client.get("/api/scenarios/baseline-pilot/events?limit=1000").json()["data"]}
    assert {"raid", "smuggling"} <= kinds
