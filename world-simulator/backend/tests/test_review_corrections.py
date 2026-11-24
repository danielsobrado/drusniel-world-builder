import asyncio
from collections import Counter

import pytest

from world_sim.canonical import state_digest
from world_sim.ids import settlement_id
from world_sim.peoples.assignments import assigned_rules
from world_sim.peoples.contracts import Assignment
from world_sim.simulation.contracts import STATE_SCHEMA_VERSION, Cohorts, CreateScenario, Scope
from world_sim.simulation.engine import advance_frames, baseline_state
from world_sim.simulation.interventions import Intervention
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.migrations import IncompatibleState, migrate_state
from world_sim.simulation.people.context import ContextBuilder
from world_sim.simulation.people.generate import age_years, band_of
from world_sim.simulation.rules import ready

CRILD = settlement_id(426)
VHALTHA = settlement_id(238)


def _baseline(model, ids, rules=None):
    return baseline_state(model, scenario_id="review", settlement_ids=ids, seed=1212, start_year=1212, rules=rules)


def test_crild_inherits_seed_ancestry_and_explicit_weights_take_priority(eldara):
    state = _baseline(eldara, [CRILD])
    [town] = state.settlements
    assert town.identity.cultureSeedId == "goblin-peoples" and town.identity.cultureId is None
    assert town.ancestries == {"goblin": town.cohorts}
    assert {p.identity.ancestryId for p in state.cast.people} == {"goblin"}

    rules = assigned_rules(eldara.config.rules, {CRILD: Assignment(ancestryWeights={"orc": 1})}, [CRILD])
    [explicit] = _baseline(eldara, [CRILD], rules).settlements
    assert explicit.identity == town.identity
    assert explicit.ancestries == {"orc": explicit.cohorts}


def _v7_legacy_fixture(model):
    rules = assigned_rules(model.config.rules, {VHALTHA: Assignment(ancestryWeights={"human": 0.25, "dwarf": 0.75})}, [VHALTHA])
    raw = _baseline(model, [VHALTHA], rules).model_dump()
    raw["schemaVersion"] = 7
    raw.pop("travel")
    [town] = raw["settlements"]
    town.pop("identity")
    town.pop("ancestries")
    town["population"] = 4
    town["cohorts"] = Cohorts(children=1, adults=3, elders=0).model_dump()
    raw["cast"]["people"] = raw["cast"]["people"][:4]
    for index, person in enumerate(raw["cast"]["people"]):
        person.pop("identity")
        person.pop("upbringing")
        person["birthplaceId"] = CRILD
        person["birthDay"] = -360 * (8 if index == 0 else 30)
    return raw, rules


def test_v7_uses_original_birthplace_for_upbringing(eldara):
    raw, rules = _v7_legacy_fixture(eldara)
    raw["cast"]["people"][-1]["birthplaceId"] = None
    upgraded, version = migrate_state(raw, eldara, rules)
    assert version == 7 and upgraded.schemaVersion == STATE_SCHEMA_VERSION
    person = upgraded.cast.people[0]
    assert person.birthplaceId == person.upbringing.settlementId == CRILD
    assert person.upbringing.cultureSeedId == "goblin-peoples"
    assert person.identity.polityId == upgraded.settlements[0].identity.polityId

    fallback = upgraded.cast.people[-1]
    assert fallback.birthplaceId is None
    assert fallback.upbringing.settlementId == VHALTHA
    assert fallback.upbringing.cultureId == "umbra-kori"


def test_v7_allocates_named_people_within_each_resident_ancestry_age_band(eldara):
    raw, rules = _v7_legacy_fixture(eldara)
    first, _ = migrate_state(raw, eldara, rules)
    raw["cast"]["people"].reverse()
    second, _ = migrate_state(raw, eldara, rules)
    assert {p.id: p.identity for p in first.cast.people} == {p.id: p.identity for p in second.cast.people}
    cfg = ready(rules)["simulation"]["people"]
    actual = Counter((p.identity.ancestryId, band_of(age_years(p, 0, cfg), cfg)) for p in first.cast.people)
    [town] = first.settlements
    for ancestry, band in actual:
        cohort_field = {"child": "children", "adult": "adults", "elder": "elders"}[band]
        assert actual[ancestry, band] <= getattr(town.ancestries[ancestry], cohort_field)
    assert sum(c.total for c in town.ancestries.values()) == town.population == 4


def test_biography_includes_seeded_institutions_in_crild(fresh_model):
    manager = ScenarioManager(fresh_model)
    session = manager.create(CreateScenario(name="Crild", scope=Scope(type="settlements", settlementIds=[CRILD])))
    context = ContextBuilder(session.state, manager.archive(session.meta.id), manager.rules(session),
                             fresh_model.settlements_by_id, manager.labeller(session.state)).build(session.state.cast.people[0].id)
    assert context["identity"]["localCulture"] == "Goblin peoples"
    assert set(context["culturalContext"]["localInstitutions"]) == {"Trading networks", "Wetland housing"}


@pytest.mark.parametrize("schema", [8, 9, 12])
def test_news_keeps_original_publication_day_when_loading_and_restoring(fresh_model, schema):
    manager = ScenarioManager(fresh_model)
    session = manager.session("baseline-pilot")
    scenario_id = session.meta.id
    origin = next(s.settlementId for s in session.state.settlements if s.name == "Falanenerwin")
    event = manager.intervene(scenario_id, Intervention(kind="granary-loss", settlementId=origin))[0]
    manager.step(scenario_id, 30)
    snapshot = manager.snapshot(scenario_id, f"v{schema} news")
    raw = session.state.model_dump()
    raw["schemaVersion"] = schema
    if schema == 8:
        raw.pop("travel")
    else:
        raw["travel"].pop("newsPublishedDays")

    snap_meta = {**snapshot.model_dump(), "checksum": state_digest(raw)}
    manager.store.save_snapshot(scenario_id, snap_meta, raw)
    manager.store.save(scenario_id, session.meta.model_dump(), raw, [e.model_dump() for e in session.events])

    reloaded = ScenarioManager(fresh_model)
    session = reloaded.session(scenario_id)
    assert session.state.travel.newsPublishedDays[event.id] == event.day == 0
    assert event.id in session.state.travel.news[origin]
    assert asyncio.run(reloaded.replay(scenario_id))["replayable"] is False
    reloaded.restore(scenario_id, snapshot.id)
    assert session.state.travel.newsPublishedDays[event.id] == 0


@pytest.mark.parametrize("max_age", [36, 42])
def test_older_reports_expire_without_refreshing_when_caravans_relay_them(fresh_model, max_age):
    manager = ScenarioManager(fresh_model)
    session = manager.session("baseline-pilot")
    origin = next(s.settlementId for s in session.state.settlements if s.name == "Falanenerwin")
    report = manager.intervene(session.meta.id, Intervention(kind="granary-loss", settlementId=origin))[0]
    destination_report = manager.intervene(session.meta.id, Intervention(kind="granary-loss", settlementId=VHALTHA))[0]
    rules = manager.rules(session)
    rules["simulation"]["travel"] = {**rules["simulation"]["travel"], "newsMaxAgeDays": max_age}
    traveling, _ = advance_frames(session.state, 36, rules)
    sale = next(c for c in traveling.trade.caravans if c.fromId == origin and c.kind == "sale")
    assert report.id in sale.news and sale.arriveDay > 36

    arrived, _ = advance_frames(traveling, sale.arriveDay - 36, rules)
    master = next(p for p in arrived.cast.people if p.id == sale.carrierId)
    if sale.arriveDay <= max_age:
        assert report.id in arrived.travel.news[sale.toId]
        assert arrived.travel.newsPublishedDays[report.id] == report.day
        assert next(k.learnedDay for k in master.knowledge if k.eventId == destination_report.id) == sale.arriveDay
        expired, _ = advance_frames(arrived, max_age + 1 - sale.arriveDay, rules)
    else:
        assert all(k.eventId not in {report.id, destination_report.id} for p in arrived.cast.people for k in p.knowledge)
        expired = arrived
    assert report.id not in expired.travel.news.get(sale.toId, [])
    assert report.id not in expired.travel.news.get(origin, [])



def test_legacy_allocation_can_reassign_a_preference_to_find_an_age_compatible_slot(eldara):
    from world_sim.peoples.catalog import choose_ancestry
    from world_sim.simulation.people.legacy import assign_residents

    [town] = _baseline(eldara, [VHALTHA]).settlements
    town = town.model_copy(update={"ancestries": {"human": Cohorts(children=1, adults=1, elders=0),
                                                 "dwarf": Cohorts(children=1, adults=0, elders=0)}})
    cfg = ready(eldara.config.rules)["simulation"]["people"]
    cfg = {**cfg, "ancestries": {"dwarf": {"ages": {"child": [0, 29], "adult": [30, 59], "elder": [60, 80]}}}}
    seed = next(seed for seed in range(100) if choose_ancestry({"dwarf": 1, "human": 1}, seed, "a") == "dwarf")
    people = [{"id": pid, "birthDay": -age * cfg["daysPerYear"]} for pid, age in (("a", 10), ("b", 20), ("c", 20))]
    assigned = assign_residents(town, people, day=0, seed=seed, cfg=cfg)
    assert assigned["a"] == "human" and {assigned["b"], assigned["c"]} == {"dwarf", "human"}


def test_v7_reports_a_conflicting_census_without_rewriting_the_save(eldara):
    raw, rules = _v7_legacy_fixture(eldara)
    raw["settlements"][0]["cohorts"] = Cohorts(children=0, adults=4, elders=0).model_dump()
    checksum = state_digest(raw)
    with pytest.raises(IncompatibleState, match="cannot fit within the saved ancestry and age cohorts"):
        migrate_state(raw, eldara, rules)
    assert state_digest(raw) == checksum
