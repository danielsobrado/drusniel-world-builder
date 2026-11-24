"""Pure scenario engine: build the baseline state and advance it day by day. No I/O."""

from collections import Counter
from typing import Any

from ..canonical import state_digest
from ..geography.paths import build_routes
from ..peoples.catalog import settlement_identity
from ..peoples.culture import environment, infrastructure
from ..peoples.physiology import food_multiplier
from ..peoples.population import ancestry_counts, combined, initial
from ..world.model import WorldModel
from .calendar import date_for
from .climate import for_month
from .contracts import Cohorts, HistoryPoint, ScenarioState, SettlementState, Society, TravelState, WorldRef
from .demography import run_month
from .economy.baseline import initial_economy
from .economy.step import deliver_day, economy_month, with_food_need
from .history.chronicle import chronicle
from .history.links import link
from .migration import TravelDay, check_travel
from .people.backstory import with_backstory
from .people.checks import check_cast
from .people.generate import initial_cast
from .people.life import people_month
from .rules import ready
from .society import check_invariants, initial_society, update_society
from .travel_news import assign_carriers, propagate, remember


def build_settlements(model: WorldModel, rows: list[tuple[dict[str, Any], dict[str, Any], Cohorts, Society]],
                      rules: dict[str, Any], seed: int) -> tuple[list[SettlementState], Any]:
    """`rows` holds (settlement fields, imported record, cohorts, society); adds the baseline economy and trade."""
    ancestry_cfg = rules.get("peoples", {}).get("ancestries", {})
    members = [({**record, "rationMultiplier": food_multiplier(ancestry_cfg, fields.get("ancestries", {}))}, cohorts.total, society)
               for fields, record, cohorts, society in rows]
    econs, trade = initial_economy(model, members, rules, seed)
    settlements = [SettlementState(**fields, cohorts=cohorts, society=with_food_need(society, econ, rules), economy=econ)
                   for (fields, _, cohorts, society), econ in zip(rows, econs, strict=True)]
    return [_with_infrastructure(s, rules) for s in settlements], trade


def _with_infrastructure(s: SettlementState, rules: dict) -> SettlementState:
    return s.model_copy(update={"infrastructure": infrastructure(s, rules.get("peoples", {}))})


def baseline_state(model: WorldModel, *, scenario_id: str, settlement_ids: list[str], seed: int, start_year: int,
                   rules: dict[str, Any] | None = None) -> ScenarioState:
    """The state at day 0; a replay passes the scenario's frozen rules, a new scenario takes the current config."""
    rules = ready(rules or model.config.rules)
    rows = []
    identity = model.audit["identity"]
    ancestries = rules["peoples"].get("ancestries", {})
    for sid in settlement_ids:
        record = model.settlements_by_id[sid]
        civic, weights = settlement_identity(record, identity, rules)
        counts = initial(record["population"], weights, ancestries, rules["simulation"]["demography"])
        cohorts = combined(counts)
        fields = {"settlementId": sid, "sourceId": record["sourceId"], "name": record["name"], "population": record["population"]}
        biome = environment(record)
        fields.update(identity=civic, ancestries=counts, environment=biome,
                      climate=for_month(biome, month_index=0, months_per_year=rules["simulation"]["calendar"]["monthsPerYear"],
                                        seed=seed, settlement_id=sid, cfg=rules["simulation"]["climate"]))
        society = initial_society(record, cohorts, rules["society"], rules["simulation"]["calendar"]["daysPerMonth"])
        rows.append((fields, record, cohorts, society))
    settlements, trade = build_settlements(model, rows, rules, seed)
    cast = initial_cast(model, settlements, trade.traders, seed, rules["simulation"]["people"])
    return ScenarioState(
        scenarioId=scenario_id,
        world=WorldRef(mapId=identity["mapId"], sourceFingerprint=identity["sourceFingerprint"]),
        seed=seed,
        startYear=start_year,
        date=date_for(0, start_year, rules["simulation"]["calendar"]),
        settlements=settlements,
        history=[HistoryPoint(day=0, population={s.settlementId: s.population for s in settlements},
                              ancestryPopulation=ancestry_counts(settlements))],
        trade=trade,
        cast=cast,
        travel=TravelState(routes=build_routes(model, settlement_ids, rules["simulation"]["travel"])),
    )


def _month(settlement: SettlementState, *, seed: int, month_index: int, rules: dict[str, Any]) -> SettlementState:
    sim = rules["simulation"]
    shortfall = max(0.0, 1.0 - settlement.economy.food.security)
    climate = for_month(settlement.environment, month_index=month_index,
                        months_per_year=sim["calendar"]["monthsPerYear"], seed=seed,
                        settlement_id=settlement.settlementId, cfg=sim["climate"])
    after = run_month(settlement, seed=seed, month_index=month_index, params=sim["demography"],
                      months_per_year=sim["calendar"]["monthsPerYear"], ancestries=rules["peoples"].get("ancestries", {}),
                      mortality=1 + rules["economy"]["famine"]["mortality"] * shortfall)
    return after.model_copy(update={"climate": climate, "society": update_society(after.society, after.cohorts, rules["society"],
                                                                    sim["calendar"]["daysPerMonth"])})


def _bounded(history: list[HistoryPoint], limit: int) -> list[HistoryPoint]:
    """Keeps the baseline point and the newest `limit - 1` month closes."""
    return history if len(history) <= limit else [history[0], *history[len(history) - limit + 1:]]


def assert_consistent(settlements: list[SettlementState], cast: Any, trade: Any, rules: dict[str, Any],
                      when: str, *, month_close: bool = True) -> None:
    """The accounting rules that must hold after every change; a break stops the step instead of saving a bad state."""
    broken = check_cast(cast, settlements, trade, rules["simulation"]["people"], minimum=month_close)
    if broken:
        raise AssertionError(f"people, {when}: {'; '.join(broken)}")
    for s in settlements:
        broken = check_invariants(s.population, s.cohorts, s.society)
        if s.ancestries and combined(s.ancestries) != s.cohorts:
            broken.append("ancestry cohorts do not match the settlement cohorts")
        if broken:
            raise AssertionError(f"{s.settlementId} {when}: {'; '.join(broken)}")


def advance_frames(state: ScenarioState, days: int, rules: dict[str, Any]) -> tuple[ScenarioState, list[dict[str, Any]]]:
    """Advances `days` days; each month close runs demography, society and the economy. Returns month summaries too."""
    rules = ready(rules)        # derived settings (the calendar's year) for any caller; unchanged for completed rules
    calendar = rules["simulation"]["calendar"]
    per_month = calendar["daysPerMonth"]
    settlements = list(state.settlements)
    trade = state.trade
    cast = state.cast
    seq = state.historySeq
    history = list(state.history)
    months: list[dict[str, Any]] = []
    day = state.date.day
    travel = state.travel
    travel_cfg = rules["simulation"]["travel"]
    knowledge = rules["simulation"]["people"]["knowledge"]
    min_news = knowledge.get("rumourMinImportance", knowledge["minImportance"])
    next_incident = min((i["day"] for i in travel.pendingIncidents), default=float("inf"))
    caravan_schedule = None
    next_arrival = float("inf")
    departures: set[int] = set()
    for _ in range(days):
        day += 1
        before = sum(s.population for s in settlements) + travel.population
        if caravan_schedule is not trade.caravans:
            caravan_schedule = trade.caravans
            next_arrival = min((c.arriveDay for c in caravan_schedule), default=float("inf"))
            departures = {c.departDay for c in caravan_schedule}
        convoys = []
        if day >= next_arrival:
            settlements, trade, convoys = deliver_day(settlements, trade, day, rules["economy"]["caravans"]["maxDelivered"])
        due = []
        if day >= next_incident:
            due = [i for i in travel.pendingIncidents if i["day"] <= day]
            pending = [i for i in travel.pendingIncidents if i["day"] > day]
            travel = travel.model_copy(update={"pendingIncidents": pending})
            next_incident = min((i["day"] for i in pending), default=float("inf"))
        today = TravelDay(travel, settlements, cast, trade, rules, state.seed, day)
        today.tick()
        settlements, cast = today.result(), today.cast
        travel_incidents = today.incidents
        arrivals = today.arrivals
        month_close = day % per_month == 0
        economy = {}
        linked, lives, past = [], [], []
        births_before = sum(s.births for s in settlements)
        deaths_before = sum(s.deaths for s in settlements)
        if month_close:
            month_index = day // per_month - 1
            settlements = [_month(s, seed=state.seed, month_index=month_index, rules=rules) for s in settlements]
            settlements, trade, economy = economy_month(settlements, trade, day, rules, state.seed)
            trade = assign_carriers(trade, cast)
            linked = link(economy["incidents"], cast, settlements)
            scheduled = [i for i in linked if i.get("day", day) > day]
            linked = [i for i in linked if i.get("day", day) <= day]
            if scheduled:
                today.state = today.state.model_copy(update={"pendingIncidents": [*today.state.pendingIncidents, *scheduled]})
                next_incident = min(next_incident, min(i["day"] for i in scheduled))
            reservations: Counter = Counter()
            for party in today.state.journeys:
                if party.active and party.status != "returning":
                    reservations[party.destinationId] += len(party.personIds)
            cast, trade, lives = people_month(cast, settlements, trade, day=day, seed=state.seed, rules=rules,
                                              reservations=reservations)
            today = TravelDay(today.state, settlements, cast, trade, rules, state.seed, day, travel_incidents)
            today.dispatch()
            settlements, cast = today.result(), today.cast
            settlements = [_with_infrastructure(s, rules) for s in settlements]
        if due:
            alive = {p.id for p in cast.people if p.alive or p.deathDay == day}
            due = [{**i, "participants": [p for p in i.get("participants", []) if p["personId"] in alive]} for i in due]
        incidents = [*due, *linked, *lives, *travel_incidents]
        events = []
        if incidents:
            cast, trade, events = chronicle(incidents, cast, trade, seq, day, rules)
            seq += len(events)
        travel = remember(today.state, events, min_news, travel_cfg["newsPerSettlement"])
        if arrivals or convoys or month_close or day in departures:
            travel, cast, trade = propagate(travel, cast, trade, arrivals, convoys, day=day, cfg=knowledge, travel_cfg=travel_cfg)
        if month_close:
            cast, past = with_backstory(cast, seq, day, settlements, rules, state.seed)
            seq += len(past)
        if not month_close and not events:
            continue
        economy["events"] = [*events, *past]
        economy["incidents"] = [{**incident, "eventId": e.id} for incident, e in zip(incidents, events, strict=True)]
        after = sum(s.population for s in settlements) + travel.population
        births = sum(s.births for s in settlements) - births_before
        deaths = sum(s.deaths for s in settlements) - deaths_before
        if after != before + births - deaths:
            raise AssertionError(f"travel population accounting failed on day {day}")
        assert_consistent(settlements, cast, trade, rules, f"day {day}", month_close=month_close)
        problems = check_travel(travel, settlements, cast, day)
        if problems:
            raise AssertionError(f"travel, day {day}: {'; '.join(problems)}")
        if not month_close:
            months.append({"day": day, "births": 0, "deaths": 0, "monthClose": False, **economy})
            continue
        history.append(HistoryPoint(day=day, population={s.settlementId: s.population for s in settlements},
                                    labour={s.settlementId: s.society.employment.labourSupply for s in settlements},
                                    unemployed={s.settlementId: s.society.employment.unemployed for s in settlements},
                                    ancestryPopulation=ancestry_counts(settlements), inTransit=travel.population,
                                    bandits=sum(r.bandits for r in trade.routes)))
        employed = sum(s.society.employment.employed for s in settlements)
        supply = sum(s.society.employment.labourSupply for s in settlements)
        months.append({
            "day": day,
            "label": date_for(day - 1, state.startYear, calendar).label[:7],
            "births": births,
            "deaths": deaths,
            "population": after,
            "inTransit": travel.population,
            "change": after - before,
            "employed": employed,
            "unemployed": supply - employed,
            **economy,
        })
    new_state = state.model_copy(update={
        "date": date_for(day, state.startYear, calendar),
        "settlements": settlements,
        "history": _bounded(history, rules["simulation"]["limits"]["maxHistoryPoints"]),
        "trade": trade,
        "cast": cast,
        "travel": travel,
        "historySeq": seq,
    })
    return new_state, months


def advance(state: ScenarioState, days: int, rules: dict[str, Any]) -> tuple[ScenarioState, list[dict[str, Any]]]:
    """The original monthly reporting API. Each summary includes canonical events since the preceding close."""
    state, frames = advance_frames(state, days, rules)
    months = []
    events, incidents = [], []
    for frame in frames:
        events.extend(frame["events"])
        incidents.extend(frame["incidents"])
        if frame.get("monthClose", True):
            months.append({**frame, "events": events, "incidents": incidents})
            events, incidents = [], []
    return state, months


def state_checksum(state: ScenarioState) -> str:
    return state_digest(state.model_dump())
