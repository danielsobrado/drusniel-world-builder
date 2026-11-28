import asyncio

import pytest

from world_sim.api.errors import ApiError
from world_sim.simulation.calendar import date_for
from world_sim.simulation.contracts import CreateScenario, Scope
from world_sim.simulation.demography import initial_cohorts
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.scope import resolve_scope


def pilot_state(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def test_calendar_dates():
    cal = {"daysPerMonth": 30, "monthsPerYear": 12}
    assert date_for(0, 1212, cal).label == "1212-01-01"
    assert date_for(29, 1212, cal).label == "1212-01-30"
    assert date_for(30, 1212, cal).label == "1212-02-01"
    assert date_for(360, 1212, cal).label == "1213-01-01"


def test_initial_cohorts_sum_to_the_imported_population():
    for population in (0, 1, 7, 6256, 15747):
        assert initial_cohorts(population, {"children": 0.33, "adults": 0.55, "elders": 0.12}).total == population


def test_baseline_matches_the_audit(astalor):
    state = pilot_state(astalor)
    assert [s.name for s in state.settlements] == ["Falanenerwin", "Sshanderi", "Vhaltha"]
    assert all(s.population == astalor.settlements_by_id[s.settlementId]["population"] for s in state.settlements)
    assert state.date.label == "1212-01-01"
    assert state.world.sourceFingerprint == astalor.audit["identity"]["sourceFingerprint"]


def test_stepping_at_once_equals_stepping_day_by_day(astalor):
    rules = astalor.config.rules
    at_once, _ = advance(pilot_state(astalor), 100, rules)
    one_by_one = pilot_state(astalor)
    for _ in range(100):
        one_by_one, _ = advance(one_by_one, 1, rules)
    assert state_checksum(at_once) == state_checksum(one_by_one)
    assert at_once.date.label == "1212-04-11"


def test_demography_conserves_accounting_over_ten_years(astalor):
    start = pilot_state(astalor)
    state, months = advance(start, 3600, astalor.config.rules)
    assert len(months) == 120 and len(state.history) == 121
    for before, after in zip(start.settlements, state.settlements, strict=True):
        assert after.population == after.cohorts.total
        assert after.population == before.population + after.births - after.deaths + after.immigrants - after.emigrants
        assert 0.8 < after.population / before.population < 1.3, "authored rates keep a decade plausible"


def test_seeds_change_outcomes_and_reruns_do_not(astalor):
    rules = astalor.config.rules
    a, _ = advance(pilot_state(astalor, 1), 360, rules)
    b, _ = advance(pilot_state(astalor, 1), 360, rules)
    c, _ = advance(pilot_state(astalor, 2), 360, rules)
    assert state_checksum(a) == state_checksum(b)
    assert state_checksum(a) != state_checksum(c)


def test_scope_resolution(astalor):
    vhaltha = astalor.settlements_by_id["settlement:azgaar-burg:238"]
    state_ids = resolve_scope(astalor, Scope(type="state", id=vhaltha["stateId"]), 120)
    assert len(state_ids) == 62 and vhaltha["id"] in state_ids
    with pytest.raises(ApiError, match="limit is 10"):
        resolve_scope(astalor, Scope(type="state", id=vhaltha["stateId"]), 10)
    with pytest.raises(ApiError, match="Unknown settlement"):
        resolve_scope(astalor, Scope(type="settlements", settlementIds=["settlement:azgaar-burg:999999"]), 10)
    with pytest.raises(ApiError, match="no settlements"):
        resolve_scope(astalor, Scope(type="province", id="region:azgaar-province:0"), 10)


def test_manager_creates_baseline_steps_snapshots_restores_and_branches(fresh_model):
    manager = ScenarioManager(fresh_model)
    assert list(manager.sessions) == ["baseline-pilot"]
    base = manager.step("baseline-pilot", 90)
    snap = manager.snapshot("baseline-pilot", "Spring")
    at_snapshot = state_checksum(base.state)
    manager.step("baseline-pilot", 200)
    assert state_checksum(base.state) != at_snapshot

    branch = manager.create(CreateScenario(name="Spring branch", fromScenarioId="baseline-pilot", fromSnapshotId=snap.id))
    assert branch.meta.id == "spring-branch" and branch.state.date.day == 90
    assert base.state.date.day == 290, "branching leaves the parent untouched"

    manager.restore("baseline-pilot", snap.id)
    assert state_checksum(base.state) == at_snapshot
    assert [e.kind for e in base.events][-1] == "restored"

    reloaded = ScenarioManager(fresh_model)
    assert sorted(reloaded.sessions) == ["baseline-pilot", "spring-branch"]
    assert state_checksum(reloaded.sessions["baseline-pilot"].state) == at_snapshot


def test_restored_run_continues_like_an_uninterrupted_one(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 60)
    snap = manager.snapshot("baseline-pilot", "")
    manager.step("baseline-pilot", 300)
    straight = state_checksum(manager.sessions["baseline-pilot"].state)
    manager.restore("baseline-pilot", snap.id)
    manager.step("baseline-pilot", 300)
    assert state_checksum(manager.sessions["baseline-pilot"].state) == straight


def test_run_loop_advances_and_pause_persists(fresh_model):
    async def scenario():
        manager = ScenarioManager(fresh_model)
        manager.run("baseline-pilot", 120)
        with pytest.raises(ApiError, match="Pause"):
            manager.step("baseline-pilot", 1)
        await asyncio.sleep(0.6)
        session = await manager.pause("baseline-pilot")
        assert not session.running and session.state.date.day >= 30
        return session.state.date.day

    day = asyncio.run(scenario())
    assert ScenarioManager(fresh_model).sessions["baseline-pilot"].state.date.day == day


def test_invalid_requests_are_refused(fresh_model):
    manager = ScenarioManager(fresh_model)
    with pytest.raises(ApiError, match="days must be"):
        manager.step("baseline-pilot", 10**6)
    with pytest.raises(ApiError, match="No scenario"):
        manager.step("missing", 1)
    with pytest.raises(ApiError, match="No snapshot"):
        manager.restore("baseline-pilot", "snap-999")
    with pytest.raises(ApiError, match="fromSnapshotId"):
        manager.create(CreateScenario(name="x", fromScenarioId="baseline-pilot"))
