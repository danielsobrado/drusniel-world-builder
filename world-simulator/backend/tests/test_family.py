"""PR6: named lives reconciled with the population, explicit relationships, marriages, migration and experience."""

from collections import Counter

from world_sim.simulation.engine import advance, baseline_state
from world_sim.simulation.history.contracts import HistoryEvent
from world_sim.simulation.people.checks import check_ties
from world_sim.simulation.people.generate import age_years, band_of
from world_sim.simulation.people.outlook import apply_experience

BANDS = {"child": "children", "adult": "adults", "elder": "elders"}


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def test_named_births_and_deaths_are_drawn_from_the_towns_own(eldara):
    state = pilot(eldara)
    cfg = eldara.config.simulation["people"]
    for _ in range(60):
        before = {p.id: p for p in state.cast.people}
        state, months = advance(state, 30, eldara.config.rules)
        events = months[0]["events"]
        for s in state.settlements:
            dead = Counter(band_of(age_years(before[e.participants[0].personId], state.date.day), cfg) for e in events
                           if e.source == "simulation" and e.kind == "died"
                           and before[e.participants[0].personId].settlementId == s.settlementId)
            for band, n in dead.items():
                assert n <= s.vitals.deaths[BANDS[band]], f"{s.name}: more named {band} deaths than the town had"
            born = [e for e in events if e.kind == "born" and e.settlementId == s.settlementId and e.source == "simulation"]
            assert len(born) <= s.vitals.births
            for e in born:
                roles = {p.role: p.personId for p in e.participants}
                assert {"newborn", "mother", "father"} <= set(roles)
                mother = next(p for p in state.cast.people if p.id == roles["mother"])
                assert age_years(mother, e.day) >= cfg["parentMinAge"], "no child before a valid age"


def test_relationships_are_explicit_and_stay_consistent(eldara):
    start = pilot(eldara)
    assert check_ties(start.cast) == []
    kinds = Counter(r.kind for r in start.cast.relationships)
    assert kinds["spouse"] and kinds["parent"] and kinds["employer"], kinds
    assert all(r.origin == "generated" for r in start.cast.relationships), "the past at the start is reconstructed, not observed"
    people = {p.id: p for p in start.cast.people}
    for r in start.cast.relationships:
        if r.kind == "parent":
            assert people[r.b].birthDay - people[r.a].birthDay >= 16 * 360
    state, months = advance(start, 3600, eldara.config.rules)
    assert check_ties(state.cast) == []
    events = {e.id: e for m in months for e in m["events"]}
    made = [r for r in state.cast.relationships if r.origin and r.origin.startswith("event:")]
    assert made, "relationships formed during the run point at the event that formed them"
    for r in made:
        assert {r.a, r.b} - {p.personId for p in events[r.origin].participants} <= {r.a} if r.kind == "employer" else True
    for e in (e for e in events.values() if e.kind == "married" and e.source == "simulation"):
        spouses = [p.personId for p in e.participants if p.role == "spouse"]
        homes = {next(p for p in state.cast.people if p.id == x).householdId for x in spouses}
        assert len(spouses) == 2 and e.householdId in {h.id for h in state.cast.households}
        assert any(r.kind == "spouse" and {r.a, r.b} == set(spouses) and r.origin == e.id for r in state.cast.relationships)
        assert len(homes) >= 1


def test_households_move_with_the_migration_flows(eldara):
    state = pilot(eldara)
    # Close most of Sshanderi's businesses: its unemployment jumps and people leave for the town with work.
    settlements = []
    for s in state.settlements:
        if s.name == "Sshanderi":
            kept = s.society.businesses[: len(s.society.businesses) // 3]
            s = s.model_copy(update={"society": s.society.model_copy(update={"businesses": kept})})
        settlements.append(s)
    state = state.model_copy(update={"settlements": settlements})
    total = sum(s.population for s in state.settlements)
    state, months = advance(state, 720, eldara.config.rules)
    assert sum(s.immigrants for s in state.settlements) == sum(s.emigrants for s in state.settlements) > 0
    assert sum(s.population for s in state.settlements) == total + sum(m["births"] - m["deaths"] for m in months)
    moved = [e for m in months for e in m["events"] if e.kind == "moved" and e.source == "simulation"]
    assert moved, "named households follow the flows"
    people = {p.id: p for p in state.cast.people}
    homes = {d.id: d for d in state.cast.dwellings}
    for e in moved:
        household = next(h for h in state.cast.households if h.id == e.householdId)
        members = [people[p.personId] for p in e.participants]
        if all(p.alive for p in members) and household.homeId:
            assert {p.settlementId for p in members} == {household.settlementId}
            assert homes[household.homeId].settlementId == household.settlementId


def test_experience_changes_personality():
    from world_sim.simulation.economy.contracts import Personality
    from world_sim.simulation.people.contracts import Cast, Person
    person = Person(id="npc:1:1", name="A", family="B", sex="male", birthDay=-9000, settlementId="s", householdId="h",
                    role="trader", personality=Personality(greed=0.5, caution=0.3, honesty=0.5))
    cast = Cast(people=[person], households=[], names={}, seq={}, budget={})
    raid = HistoryEvent(id="event:1", seq=1, day=30, datePrecision="month", kind="raid", category="conflict", source="simulation",
                        participants=[{"personId": "npc:1:1", "role": "caravan-master"}], importance=4, visibility="settlement",
                        summary="raided")
    after = apply_experience(cast, [raid], {"raid": {"caravan-master": {"caution": 0.05}}})
    assert after.people[0].personality.caution == 0.35 and after.people[0].personality.greed == 0.5


def test_vacancies_are_filled_by_inhabitants_coming_into_focus(eldara):
    _, months = advance(pilot(eldara), 3600, eldara.config.rules)
    focus = [e for m in months for e in m["events"] if e.kind == "promoted"]
    assert focus and all(e.source == "inferred" for e in focus)
    assert not any(e.kind == "arrived" for m in months for e in m["events"]), "nobody is invented from outside the population"
