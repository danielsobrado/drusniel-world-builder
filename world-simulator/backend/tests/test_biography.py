"""PR6.3-6.6: reconstructed pasts, causes, knowledge, narrative hooks and the biography context."""

from collections import Counter

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.economy.contracts import Personality
from world_sim.simulation.history.causes import link_causes, stamp_cache
from world_sim.simulation.history.contracts import HistoryEvent
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.people.contracts import Cast, Person
from world_sim.simulation.people.generate import age_years


def test_everyone_at_the_start_has_a_checked_past(fresh_model):
    manager = ScenarioManager(fresh_model)
    state = manager.session("baseline-pilot").state
    archive = manager.archive("baseline-pilot")
    past = archive.query(sources=["generated-prehistory"], limit=None)
    assert all(p.backstory for p in state.cast.people) and state.historySeq == len(past)
    people = {p.id: p for p in state.cast.people}
    facts = Counter(x.personId for e in past for x in e.participants)
    adults = [p for p in state.cast.people if age_years(p, 0) >= 18]
    assert sum(facts[p.id] for p in adults) / len(adults) >= 3, "an ordinary adult has a few established facts"
    for e in past:
        assert e.datePrecision in ("year", "approximate") and e.day <= 0
        for x in e.participants:
            assert e.day >= people[x.personId].birthDay, f"{e.id} happens before {x.personId} was born"
        if e.kind == "born":
            assert e.locationId in fresh_model.settlements_by_id, "birthplaces are settlements of the imported map"
    for p in adults:
        mine = sorted((e for e in past if p.id in {x.personId for x in e.participants}), key=lambda e: e.day)
        moved = [e for e in mine if e.kind == "moved"]
        later = [e for e in mine if e.kind in ("hired", "married")]
        if moved and later:
            assert moved[0].day <= later[0].day, f"{p.id} moves to town before working or marrying there"
    spouses = [r for r in state.cast.relationships if r.kind == "spouse"]
    assert spouses and all(r.origin and r.origin.startswith("event:") for r in spouses), "a reconstructed tie points at its event"


def test_causes_link_only_what_the_simulation_established():
    person = Person(id="npc:1:1", name="A", family="B", sex="male", birthDay=-9000, settlementId="s", householdId="h", role="unemployed",
                    personality=Personality(greed=0.9, caution=0.1, honesty=0.1))
    cast = Cast(people=[person], households=[], names={}, seq={}, budget={})

    def event(seq: int, kind: str, **fields) -> HistoryEvent:
        return HistoryEvent(id=f"event:{seq}", seq=seq, day=seq * 30, datePrecision="month", kind=kind, category="career",
                            source="simulation", importance=3, visibility="settlement", summary=kind,
                            participants=fields.pop("participants", [{"personId": "npc:1:1", "role": "subject"}]), **fields)

    closed = event(1, "closed", businessId="b1", participants=[])
    lost = event(2, "lost-work", businessId="b1")
    month_one = link_causes([closed, lost], cast)
    assert month_one[1].causedBy == ["event:1"], "the workplace closed, so the work was lost"
    cast = stamp_cache(cast, month_one, 24)
    outlaw = link_causes([event(5, "outlaw")], cast)[0]
    assert outlaw.causedBy == ["event:2"], "turned outlaw after losing work"
    died = link_causes([event(6, "died")], cast)[0]
    assert died.causedBy == [], "no cause is claimed for a death"


def test_news_travels_through_households_friends_and_roads(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 1800)
    state = manager.session("baseline-pilot").state
    archive = manager.archive("baseline-pilot")
    entries = [(p, k) for p in state.cast.people for k in p.knowledge]
    assert entries and {k.how for _, k in entries} & {"told"}
    for p, k in entries:
        e = archive.get(k.eventId)
        assert e is not None and p.id not in {x.personId for x in e.participants}, "second-hand means not having been there"
        assert e.visibility != "private" and 0 < k.confidence <= 1
        if k.how == "told":
            teller = next(x for x in state.cast.people if x.id == k.fromId)
            assert teller.id in {x.personId for x in e.participants}


def test_biography_context_holds_only_recorded_facts(fresh_model):
    client = TestClient(create_app(fresh_model))
    client.post("/api/scenarios/baseline-pilot/step", json={"days": 1800})
    people = client.get("/api/scenarios/baseline-pilot/people?pageSize=200").json()["data"]
    master = next(p for p in people if p["role"] == "trader")
    ctx = client.get(f"/api/scenarios/baseline-pilot/people/{master['id']}/context").json()["data"]
    assert ctx["tier"] == "major" and ctx["restrictions"] and len(ctx["hooks"]) <= 3
    assert ctx["identity"]["name"] == f"{master['name']} {master['family']}" and ctx["identity"]["culture"]
    timeline = client.get(f"/api/scenarios/baseline-pilot/people/{master['id']}/timeline").json()["data"]
    ids = {e["id"] for e in timeline}
    assert ctx["milestones"] and all(m["id"] in ids for m in ctx["milestones"]), "milestones are the person's own events"
    assert all(m["precision"] in ("year", "approximate") for m in ctx["milestones"] if m["source"] == "generated-prehistory")
    assert all(r["origin"] for r in ctx["relationships"])
    assert set(ctx["outlook"]) == {"fears", "ambitions", "concerns", "mood"}

    caused = next((e for e in timeline if e["causedBy"]), None)
    some = caused or timeline[-1]
    detail = client.get(f"/api/scenarios/baseline-pilot/history/events/{some['id']}").json()["data"]
    assert detail["participants"] and all(x["name"] for x in detail["participants"])
    assert [c["id"] for c in detail["causes"]] == some["causedBy"]
    assert client.get("/api/scenarios/baseline-pilot/history/events/event:999999").status_code == 404
    filtered = client.get(f"/api/scenarios/baseline-pilot/people/{master['id']}/timeline?source=generated-prehistory").json()["data"]
    assert filtered and all(e["source"] == "generated-prehistory" for e in filtered)
