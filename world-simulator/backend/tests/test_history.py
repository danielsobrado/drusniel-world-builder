"""PR6.1-6.2: canonical events, their archive, and their behaviour under snapshots, restores and branches."""

import copy
import dataclasses

from world_sim.simulation.contracts import CreateScenario
from world_sim.simulation.engine import advance, baseline_state
from world_sim.simulation.history.validation import check_events
from world_sim.simulation.manager import ScenarioManager


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def decade(model):
    start = pilot(model)
    state, months = advance(start, 3600, model.config.rules)
    events = [e for m in months for e in m["events"]]
    known = {b.id for s in start.settlements for b in s.society.businesses} | {e.businessId for e in events if e.businessId}
    return state, events, known


def test_every_event_is_canonical_valid_and_numbered(eldara):
    state, events, known = decade(eldara)
    assert [e.seq for e in events] == list(range(len(events))) and state.historySeq == len(events)
    assert all(e.id == f"event:{e.seq}" and e.datePrecision == "month" for e in events)
    assert {e.source for e in events} <= {"simulation", "inferred"}, "only someone coming into focus is inferred, not observed"
    assert check_events(events, state, known) == []
    kinds = {e.kind for e in events}
    assert {"died", "hired", "opened", "raid"} <= kinds
    raid = next(e for e in events if e.kind == "raid")
    assert raid.routeId and raid.caravanId and raid.facts["cargoLost"] > 0
    assert {p.role for p in raid.participants} >= {"caravan-master"}
    assert any(eff.kind == "trade-loss" for eff in raid.effects)
    deaths = [e for e in events if e.kind == "died"]
    assert all("cause" not in e.summary for e in deaths) and all(e.facts.get("age") is not None for e in deaths), \
        "no cause is claimed that the simulation did not model"


def test_one_event_is_shared_by_everyone_involved(eldara):
    _, events, _ = decade(eldara)
    shared = [e for e in events if len({p.personId for p in e.participants}) >= 2]
    assert shared, "a raid or a birth links several people to the same event"
    for e in shared:
        assert len(e.participants) == len({(p.personId, p.role) for p in e.participants})


def test_the_permanent_timeline_outlives_the_recent_cache(eldara):
    rules = copy.deepcopy(eldara.config.rules)
    rules["simulation"]["history"]["recentEvents"] = 2
    state, months = advance(pilot(eldara), 3600, rules)
    events = {e.id: e for m in months for e in m["events"]}
    for p in state.cast.people:
        assert len(p.events) <= 2
        assert all(events[i].importance >= 3 and p.id in {x.personId for x in events[i].participants} for i in p.timeline)
    long_lived = max(state.cast.people, key=lambda p: len(p.timeline))
    assert len(long_lived.timeline) > 2, "important events stay reachable after the cache has moved on"


def test_identical_runs_record_identical_histories(eldara):
    a = [e.model_dump() for m in advance(pilot(eldara), 1440, eldara.config.rules)[1] for e in m["events"]]
    b = [e.model_dump() for m in advance(pilot(eldara), 1440, eldara.config.rules)[1] for e in m["events"]]
    assert a == b and a


def test_restores_and_branches_keep_their_own_history(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 720)
    snap = manager.snapshot("baseline-pilot", "two years")
    archive = manager.archive("baseline-pilot")
    at_snapshot = [e.id for e in archive.query(limit=None)]
    manager.step("baseline-pilot", 720)
    first_future = [e.model_dump() for e in archive.query(limit=None)]
    assert len(first_future) > len(at_snapshot)

    manager.restore("baseline-pilot", snap.id)
    assert [e.id for e in archive.query(limit=None)] == at_snapshot, "the restored timeline ends at the snapshot"
    branch = manager.create(CreateScenario(name="Branch", fromScenarioId="baseline-pilot", fromSnapshotId=snap.id))
    manager.step("baseline-pilot", 720)
    assert [e.model_dump() for e in archive.query(limit=None)] == first_future, "replaying gives the same history"
    branch_ids = [e.id for e in manager.archive(branch.meta.id).query(limit=None)]
    assert branch_ids == at_snapshot, "a branch never sees its sibling's future"

    log = [e for e in manager.session("baseline-pilot").events if e.kind == "hired"]
    assert log and all(e.data.get("eventId", "").startswith("event:") and e.data.get("personId") for e in log)


def test_a_crash_between_archive_and_bundle_heals_on_load(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 360)
    saved = manager.session("baseline-pilot").state.historySeq
    archive = manager.archive("baseline-pilot")
    extra = advance(manager.session("baseline-pilot").state, 360, manager.rules(manager.session("baseline-pilot")))[1]
    archive.append([e for m in extra for e in m["events"]])     # appended, but the bundle was never saved
    assert archive.count() > saved
    ScenarioManager(dataclasses.replace(fresh_model))
    assert archive.count() == saved
