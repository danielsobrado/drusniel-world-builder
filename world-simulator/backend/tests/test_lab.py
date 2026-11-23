"""PR8: interventions, deterministic replay, scenario comparison, causal traces, consistency checks and metrics."""

import asyncio

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.contracts import CreateScenario
from world_sim.simulation.interventions import Intervention
from world_sim.simulation.lab import Lab
from world_sim.simulation.manager import ScenarioManager

BASE = "/api/scenarios/baseline-pilot"


def mine_of(manager: ScenarioManager, scenario_id: str = "baseline-pilot"):
    """The staffed business with the most named workers (a mine when there is one), for a disaster to strike."""
    state = manager.session(scenario_id).state
    named = {}
    for p in state.cast.people:
        if p.alive and p.role == "worker":
            named[p.businessId] = named.get(p.businessId, 0) + 1
    businesses = [b for s in state.settlements for b in s.society.businesses if b.filled]
    return max(businesses, key=lambda b: (b.kind == "mine", named.get(b.id, 0), b.id))


def test_a_mine_collapse_runs_through_the_simulation(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 60)
    mine = mine_of(manager)
    town = next(s for s in manager.session("baseline-pilot").state.settlements if any(b.id == mine.id for b in s.society.businesses))
    workers = [p.id for p in manager.session("baseline-pilot").state.cast.people if p.alive and p.businessId == mine.id]
    events = manager.intervene("baseline-pilot", Intervention(kind="disaster", businessId=mine.id, note="the lower gallery gave way"))

    disaster, *lost = events
    assert disaster.source == "intervention" and disaster.kind == "disaster" and disaster.visibility == "public"
    assert disaster.summary.endswith("collapsed: the lower gallery gave way")
    assert {e.participants[0].personId for e in lost} == set(workers)
    assert all(e.kind == "lost-work" and e.causedBy == [disaster.id] for e in lost), "the workers lost work because of it"
    state = manager.session("baseline-pilot").state
    after = next(s for s in state.settlements if s.settlementId == town.settlementId)
    assert all(b.id != mine.id for b in after.society.businesses)
    assert all(p.role == "unemployed" for p in state.cast.people if p.id in workers)

    manager.step("baseline-pilot", 30)
    later = next(s for s in manager.session("baseline-pilot").state.settlements if s.settlementId == town.settlementId)
    if mine.good:
        made = {line.good: line.produced for line in later.economy.production}
        before = {line.good: line.produced for line in town.economy.production}
        assert made.get(mine.good, 0) < before.get(mine.good, 0), "its output fell"


def test_replay_reproduces_steps_interventions_and_restores(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 45)
    snap = manager.snapshot("baseline-pilot", "before")
    manager.intervene("baseline-pilot", Intervention(kind="disaster", businessId=mine_of(manager).id, cause="fire"))
    manager.step("baseline-pilot", 20)
    manager.step("baseline-pilot", 25)
    result = asyncio.run(manager.replay("baseline-pilot"))
    assert result["matches"], result
    assert result["history"]["liveCount"] == result["history"]["replayedCount"] > 0

    manager.restore("baseline-pilot", snap.id)
    route = manager.session("baseline-pilot").state.trade.routes[0]
    manager.intervene("baseline-pilot", Intervention(kind="bandit-surge", routeId=route.id, bandits=12))
    manager.step("baseline-pilot", 30)
    assert asyncio.run(manager.replay("baseline-pilot"))["matches"], "the journal was cut at the snapshot"


def test_a_branch_with_a_disaster_compares_against_its_parent_and_replays(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 30)
    snap = manager.snapshot("baseline-pilot", "fork")
    branch = manager.create(CreateScenario(name="Collapse", fromScenarioId="baseline-pilot", fromSnapshotId=snap.id)).meta.id
    mine = mine_of(manager, branch)
    workers = {p.id for p in manager.session(branch).state.cast.people if p.alive and p.businessId == mine.id}
    manager.intervene(branch, Intervention(kind="disaster", businessId=mine.id))
    manager.step(branch, 60)
    manager.step("baseline-pilot", 60)

    lab = Lab(manager)
    diff = lab.compare({"scenarioId": "baseline-pilot"}, {"scenarioId": branch})
    assert diff["dates"]["same"]
    assert diff["history"]["shared"] == manager.session(branch).state.historySeq - diff["history"]["afterB"]
    assert any(e["kind"] == "disaster" and e["source"] == "intervention" for e in diff["history"]["notableB"])
    assert workers <= {p["personId"] for p in diff["people"]["changed"]}, "the workers' lives went differently"
    town = next(s for s in diff["settlements"] if s["name"] in mine.name)
    assert town["measures"]["businesses"]["delta"] != 0 or town["production"]
    assert asyncio.run(manager.replay(branch))["matches"], "a branch replays from its root's baseline"

    before = lab.compare({"scenarioId": branch, "snapshotId": None}, {"scenarioId": "baseline-pilot", "snapshotId": snap.id})
    assert not before["dates"]["same"] and before["history"]["afterA"] > 0
    forked_at = manager._snapshot_state("baseline-pilot", snap.id)[1].historySeq
    assert before["history"]["shared"] == forked_at and before["history"]["afterB"] == 0, "a snapshot is a prefix of what followed"


def test_trace_validation_and_metrics_after_a_collapse(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 30)
    disaster, *lost = manager.intervene("baseline-pilot", Intervention(kind="disaster", businessId=mine_of(manager).id))
    manager.step("baseline-pilot", 90)
    lab = Lab(manager)

    traced = lab.trace("baseline-pilot", disaster.id)
    assert {n["event"].id for n in traced["nodes"] if n["depth"] == 1} >= {e.id for e in lost}
    assert [disaster.id, lost[0].id] in traced["edges"]
    back = lab.trace("baseline-pilot", lost[0].id)
    assert any(n["event"].id == disaster.id and n["depth"] == -1 for n in back["nodes"])

    report = lab.validate("baseline-pilot")
    assert report["passed"], [c for c in report["checks"] if not c["passed"]]
    assert {c["id"] for c in report["checks"]} >= {"accounting", "people", "history", "references", "archive"}

    metrics = lab.metrics("baseline-pilot")
    assert metrics["steps"]["months"] == 4 and metrics["steps"]["msPerMonth"]["mean"] > 0
    assert metrics["size"]["events"] == manager.session("baseline-pilot").state.historySeq


def test_affected_people_town_and_strangers_know_the_disaster_differently(fresh_model):
    """Master plan workflow B: a worker lived it, a neighbour knows it as town news, a stranger elsewhere does not know it."""
    with TestClient(create_app(fresh_model)) as client:
        client.post(f"{BASE}/step", json={"days": 30})
        manager = client.app.state.scenarios
        mine = mine_of(manager)
        people = manager.session("baseline-pilot").state.cast.people
        worker = next(p for p in people if p.alive and p.businessId == mine.id)
        neighbour = next(p for p in people if p.alive and p.settlementId == mine.settlementId and p.businessId != mine.id
                         and p.householdId != worker.householdId and p.role != "child")
        stranger = next(p for p in people if p.alive and p.settlementId != mine.settlementId and p.role != "trader")
        event = client.post(f"{BASE}/interventions", json={"kind": "disaster", "businessId": mine.id}).json()["data"][0]
        client.post(f"{BASE}/step", json={"days": 30})

        def context(p):
            return client.get(f"{BASE}/people/{p.id}/context").json()["data"]

        lived = context(worker)
        assert any(m["kind"] == "lost-work" for m in lived["milestones"])
        assert lived["work"]["role"] != "worker" or lived["work"]["workplace"] != mine.name
        assert any(h["id"] == event["id"] for h in context(neighbour)["settlementHistory"]), "the town knows"
        far = context(stranger)
        assert not any(h["id"] == event["id"] for h in far["settlementHistory"])
        assert not any(mine.name in k["event"] for k in far["knowledge"]), "nobody told them"


def test_interventions_are_validated_over_the_api(fresh_model):
    with TestClient(create_app(fresh_model)) as client:
        bad = client.post(f"{BASE}/interventions", json={"kind": "disaster", "businessId": "business:nowhere"})
        assert bad.status_code == 400 and bad.json()["error"]["code"] == "invalid_intervention"
        town = client.get(BASE).json()["data"]["settlementIds"][0]
        ok = client.post(f"{BASE}/interventions", json={"kind": "granary-loss", "settlementId": town, "share": 0.8})
        assert ok.status_code == 201
        event = ok.json()["data"][0]
        assert event["source"] == "intervention" and "granary" in event["summary"]
