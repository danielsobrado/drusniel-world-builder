"""PR9A: correctness fixes from the 2026-11-23 review, one test per finding."""

import asyncio

from world_sim.canonical import state_digest
from world_sim.simulation.contracts import STATE_SCHEMA_VERSION
from world_sim.simulation.economy.contracts import Caravan, Route
from world_sim.simulation.economy.market import affordable
from world_sim.simulation.engine import advance, baseline_state
from world_sim.simulation.history.archive import HistoryArchive
from world_sim.simulation.history.contracts import HistoryEvent
from world_sim.simulation.manager import ScenarioManager
from world_sim.simulation.migration import TravelDay
from world_sim.simulation.people.contracts import NpcHousehold
from world_sim.simulation.people.family import births
from world_sim.simulation.people.generate import age_years
from world_sim.simulation.people.life import Month, _towns, _work
from world_sim.simulation.people.relationships import Ties
from world_sim.simulation.rules import complete, freeze, ready
from world_sim.simulation.travel_news import propagate, remember


def pilot(model):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=1212, start_year=1212), ready(model.config.rules)


def month(state, rules, day, ties=None):
    return Month(day, state.seed, rules["simulation"]["people"], rules["economy"], {t.id: t for t in state.trade.traders}, 24,
                 ties or Ties(state.cast.relationships, state.cast.relSeq), dict(state.cast.seq))


def a_couple(state, ties):
    people = {p.id: p for p in state.cast.people}
    for p in sorted(state.cast.people, key=lambda p: p.id):
        partner = ties.spouse(p.id) if p.sex == "female" and p.alive else None
        if partner and people[partner].householdId == p.householdId:
            return p, people[partner]
    raise AssertionError("no married couple in the pilot")


def test_a_couple_married_this_month_finds_its_new_household_and_waits_to_have_a_child(astalor):
    state, rules = pilot(astalor)
    ties = Ties(state.cast.relationships, state.cast.relSeq)
    mother, father = a_couple(state, ties)
    day = 3000
    m = month(state, rules, day, ties)
    town = next(s for s in state.settlements if s.settlementId == mother.settlementId)
    town = town.model_copy(update={"vitals": town.vitals.model_copy(update={"births": 1000}),
                                   "cohorts": town.cohorts.model_copy(update={"adults": 2})})
    new = NpcHousehold(id="household:new", settlementId=town.settlementId, family="Newwed", kind="couple", housing="cottage")
    people = {p.id: p for p in state.cast.people}
    for p in (mother, father):
        people[p.id] = p.model_copy(update={"householdId": new.id, "birthDay": day - 25 * rules["simulation"]["people"]["daysPerYear"]})
    m.people = people
    for x in list(ties.children(mother.id)):          # no earlier child in the way
        people[x] = people[x].model_copy(update={"birthDay": day - 5000})
    households = [*state.cast.households, new]          # the working list: the marriage made this household this month

    rel = ties.of(mother.id, "spouse")[0]
    ties.items[ties.items.index(rel)] = rel.model_copy(update={"since": day - 10})
    births(people, town, m, state.cast, 5, households)
    assert not [x for x in ties.children(mother.id) if people[x].birthDay == day], "no child ten days after the wedding"

    rel = ties.of(mother.id, "spouse")[0]
    ties.items[ties.items.index(rel)] = rel.model_copy(update={"since": day - 400})
    births(people, town, m, state.cast, 5, households)
    child = next(people[x] for x in ties.children(mother.id) if people[x].birthDay == day)
    assert child.family == "Newwed", "found in the month's households, not the cast's from before"


def test_ages_spans_and_dates_follow_the_frozen_calendar(astalor, fresh_model, monkeypatch):
    frozen = freeze(astalor.config.rules)
    frozen["simulation"]["calendar"] = {**frozen["simulation"]["calendar"], "daysPerMonth": 20}
    people = complete(frozen, astalor.config.rules)["simulation"]["people"]
    assert people["daysPerYear"] == 240 and people["daysPerMonth"] == 20
    state, _ = pilot(astalor)
    p = state.cast.people[0]
    assert age_years(p, 0, people) == -p.birthDay // 240

    manager = ScenarioManager(fresh_model)            # frozen with 30-day months
    calendar = {**fresh_model.config.simulation["calendar"], "daysPerMonth": 20}
    monkeypatch.setitem(fresh_model.config.simulation, "calendar", calendar)    # the YAML changes afterwards
    manager.step("baseline-pilot", 30)
    session = manager.session("baseline-pilot")
    assert session.state.date.label == "1212-02-01" and session.events[-1].date == "1212-02-01"
    assert manager.labeller(session.state)(30) == "1212-02-01", "dated by the scenario's own calendar"


def test_children_move_with_their_adults_and_elders_stay(astalor):
    state, rules = pilot(astalor)
    towns = sorted(state.settlements, key=lambda s: s.settlementId)
    idle = towns[0].society.employment.model_copy(update={"unemployed": towns[0].society.employment.labourSupply // 2})
    towns[0] = towns[0].model_copy(update={"society": towns[0].society.model_copy(update={"employment": idle})})
    travel = TravelDay(state.travel, towns, state.cast, state.trade, rules, state.seed, 30)
    travel.dispatch()
    assert travel.state.journeys, "the idle town sends people"
    before = {s.settlementId: s.cohorts for s in towns}
    moved = {s.settlementId: s.cohorts for s in travel.result()}
    origin = towns[0].settlementId
    adults = before[origin].adults - moved[origin].adults
    children = before[origin].children - moved[origin].children
    assert children > 0 and abs(children - adults * before[origin].children / before[origin].adults) <= 1
    assert all(moved[s].elders == before[s].elders for s in before), "elders stay"
    assert sum(s.population for s in travel.result()) + travel.state.population == sum(s.population for s in towns)


def test_rumours_arrive_with_the_caravan_not_when_it_leaves(astalor):
    state, rules = pilot(astalor)
    knowledge, travel_cfg = rules["simulation"]["people"]["knowledge"], rules["simulation"]["travel"]
    master = next(p for p in state.cast.people if p.traderId)
    trader = next(t for t in state.trade.traders if t.id == master.traderId)
    market = next(mk for mk in state.trade.markets if mk.centerSettlementId != master.settlementId)
    inn = next(p for p in state.cast.people if p.settlementId == market.centerSettlementId and p.role != "child")
    cast = state.cast.model_copy(update={"people": [p.model_copy(update={"profession": "innkeeper"}) if p.id == inn.id else p
                                                    for p in state.cast.people]})
    news = HistoryEvent(id="event:9000", seq=9000, day=60, datePrecision="day", kind="disaster", category="settlement",
                        source="intervention",
                        settlementId=master.settlementId, importance=5, visibility="public", summary="The mine collapsed")
    leaving = Caravan(id="caravan:x", kind="sale", marketId=market.marketId, fromId=master.settlementId, fromName="Home",
                      toId=market.centerSettlementId, toName=market.centerName, cargo={}, value=0.0, departDay=60, arriveDay=67,
                      traderId=trader.id)
    trade = state.trade.model_copy(update={"caravans": [leaving], "delivered": []})
    travel = remember(state.travel, [news], 4, travel_cfg["newsPerSettlement"])
    travel, cast, trade = propagate(travel, cast, trade, [], [], day=60, cfg=knowledge, travel_cfg=travel_cfg)
    told = {p.id: p.knowledge for p in cast.people}
    assert not any(k.eventId == news.id for k in told[inn.id]), "nobody at the market knows when the caravan leaves"
    assert trade.caravans[0].news == [news.id]

    arrived = trade.model_copy(update={"caravans": [], "delivered": [trade.caravans[0]]})
    _, cast, _ = propagate(travel, cast, arrived, [], arrived.delivered, day=67, cfg=knowledge, travel_cfg=travel_cfg)
    heard = next(k for k in next(p for p in cast.people if p.id == inn.id).knowledge if k.eventId == news.id)
    assert heard.how == "rumour" and heard.fromId == master.id and heard.learnedDay == 67


def test_a_town_buys_no_more_than_it_can_pay_for_food_first(astalor):
    prices = {"Rations": 1.0, "Iron": 10.0}
    assert affordable({"Rations": 50, "Iron": 10}, prices, 1000, "Rations") == {"Rations": 50, "Iron": 10}
    assert affordable({"Rations": 50, "Iron": 10}, prices, 70, "Rations") == {"Rations": 50, "Iron": 2}
    assert affordable({"Rations": 50, "Iron": 10}, prices, 30, "Rations") == {"Rations": 30}
    state, rules = pilot(astalor)
    poor = [s.model_copy(update={"economy": s.economy.model_copy(update={"treasury": 0.0})}) for s in state.settlements]
    later, _ = advance(state.model_copy(update={"settlements": poor}), 360, rules)
    assert all(s.economy.treasury >= -rules["economy"]["market"]["credit"] - 1e-6 for s in later.settlements)


def test_outlaws_choose_among_their_towns_routes(astalor):
    state, rules = pilot(astalor)
    route = state.trade.routes[0]
    second = Route(**{**route.model_dump(), "id": "route:second", "centerName": "Elsewhere", "bandits": route.bandits + 30})
    people = {p.id: p for p in state.cast.people}
    towns = _towns(people, state.settlements, [*state.trade.routes, second])
    town = towns[route.settlementId]
    assert set(town.routes) == {route.id, second.id}
    idle = next(p for p in people.values() if p.settlementId == route.settlementId and p.role in ("unemployed", "worker", "retired"))
    bold = idle.personality.model_copy(update={"honesty": 0.0, "greed": 1.0})
    idle = idle.model_copy(update={"role": "unemployed", "businessId": None, "idleMonths": 99, "personality": bold})
    cfg = {**rules["simulation"]["people"], "findWorkPerMonth": 0.0,
           "outlaw": {**rules["simulation"]["people"]["outlaw"], "chance": 1.0}}
    m = month(state, rules, 30)
    m.cfg = cfg
    import random
    outlaw = _work(idle, town, m, random.Random(1))
    assert outlaw.role == "outlaw" and outlaw.routeId == second.id, "the band with room draws them"
    assert town.outlaws[second.id] == 1


def test_consequences_come_from_an_index_and_old_archives_are_backfilled(tmp_path):
    archive = HistoryArchive(tmp_path / "history.sqlite")
    cause = HistoryEvent(id="event:0", seq=0, day=0, datePrecision="day", kind="disaster", category="settlement", source="intervention",
                         importance=5, visibility="public", summary="Collapse")
    effect = cause.model_copy(update={"id": "event:1", "seq": 1, "kind": "lost-work", "causedBy": ["event:0"], "summary": "Lost work"})
    archive.append([cause, effect])
    assert [e.id for e in archive.consequences(cause)] == ["event:1"]
    import sqlite3
    db = sqlite3.connect(tmp_path / "history.sqlite")
    db.execute("DELETE FROM causes")
    db.execute("PRAGMA user_version = 0")       # an archive written before the index
    db.commit()
    db.close()
    assert [e.id for e in HistoryArchive(tmp_path / "history.sqlite").consequences(cause)] == ["event:1"]


def test_a_snapshot_from_the_previous_schema_still_restores(fresh_model):
    manager = ScenarioManager(fresh_model)
    manager.step("baseline-pilot", 30)
    session = manager.session("baseline-pilot")
    raw = session.state.model_dump()
    raw["schemaVersion"] = 6
    for c in raw["trade"]["caravans"]:
        c.pop("news")
    for c in raw["trade"]["delivered"]:
        c.pop("news")
    meta = {"id": "snap-900", "label": "From v6", "date": raw["date"], "checksum": state_digest(raw),
            "createdAt": "2026-11-23T00:00:00+00:00"}
    manager.store.save_snapshot("baseline-pilot", meta, raw)
    manager.step("baseline-pilot", 30)
    manager.restore("baseline-pilot", "snap-900")
    assert manager.session("baseline-pilot").state.schemaVersion == STATE_SCHEMA_VERSION
    assert asyncio.run(manager.replay("baseline-pilot"))["replayable"] is False, "a hand-made snapshot has no journal place"
