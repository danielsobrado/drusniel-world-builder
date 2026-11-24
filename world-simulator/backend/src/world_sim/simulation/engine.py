"""Pure scenario engine: build the baseline state and advance it day by day. No I/O."""

from typing import Any

from ..canonical import state_digest
from ..world.model import WorldModel
from .calendar import date_for
from .contracts import Cohorts, HistoryPoint, ScenarioState, SettlementState, Society, WorldRef
from .demography import initial_cohorts, run_month
from .economy.baseline import initial_economy
from .economy.step import economy_month, with_food_need
from .history.chronicle import chronicle
from .history.links import link
from .migration import migrate
from .people.backstory import with_backstory
from .people.checks import check_cast
from .people.generate import initial_cast
from .people.life import people_month
from .rules import ready
from .society import check_invariants, initial_society, update_society


def build_settlements(model: WorldModel, rows: list[tuple[dict[str, Any], dict[str, Any], Cohorts, Society]],
                      rules: dict[str, Any], seed: int) -> tuple[list[SettlementState], Any]:
    """`rows` holds (settlement fields, imported record, cohorts, society); adds the baseline economy and trade."""
    econs, trade = initial_economy(model, [(record, cohorts.total, society) for _, record, cohorts, society in rows], rules, seed)
    settlements = [SettlementState(**fields, cohorts=cohorts, society=with_food_need(society, econ, rules), economy=econ)
                   for (fields, _, cohorts, society), econ in zip(rows, econs, strict=True)]
    return settlements, trade


def baseline_state(model: WorldModel, *, scenario_id: str, settlement_ids: list[str], seed: int, start_year: int,
                   rules: dict[str, Any] | None = None) -> ScenarioState:
    """The state at day 0; a replay passes the scenario's frozen rules, a new scenario takes the current config."""
    rules = ready(rules or model.config.rules)
    rows = []
    for sid in settlement_ids:
        record = model.settlements_by_id[sid]
        cohorts = initial_cohorts(record["population"], rules["simulation"]["demography"]["initialShares"])
        fields = {"settlementId": sid, "sourceId": record["sourceId"], "name": record["name"], "population": record["population"]}
        society = initial_society(record, cohorts, rules["society"], rules["simulation"]["calendar"]["daysPerMonth"])
        rows.append((fields, record, cohorts, society))
    settlements, trade = build_settlements(model, rows, rules, seed)
    cast = initial_cast(model, settlements, trade.traders, seed, rules["simulation"]["people"])
    identity = model.audit["identity"]
    return ScenarioState(
        scenarioId=scenario_id,
        world=WorldRef(mapId=identity["mapId"], sourceFingerprint=identity["sourceFingerprint"]),
        seed=seed,
        startYear=start_year,
        date=date_for(0, start_year, rules["simulation"]["calendar"]),
        settlements=settlements,
        history=[HistoryPoint(day=0, population={s.settlementId: s.population for s in settlements})],
        trade=trade,
        cast=cast,
    )


def _month(settlement: SettlementState, *, seed: int, month_index: int, rules: dict[str, Any]) -> SettlementState:
    sim = rules["simulation"]
    shortfall = max(0.0, 1.0 - settlement.economy.food.security)
    after = run_month(settlement, seed=seed, month_index=month_index, params=sim["demography"],
                      months_per_year=sim["calendar"]["monthsPerYear"], mortality=1 + rules["economy"]["famine"]["mortality"] * shortfall)
    return after.model_copy(update={"society": update_society(after.society, after.cohorts, rules["society"],
                                                                    sim["calendar"]["daysPerMonth"])})


def _bounded(history: list[HistoryPoint], limit: int) -> list[HistoryPoint]:
    """Keeps the baseline point and the newest `limit - 1` month closes."""
    return history if len(history) <= limit else [history[0], *history[len(history) - limit + 1:]]


def assert_consistent(settlements: list[SettlementState], cast: Any, trade: Any, rules: dict[str, Any], when: str) -> None:
    """The accounting rules that must hold after every change; a break stops the step instead of saving a bad state."""
    broken = check_cast(cast, settlements, trade, rules["simulation"]["people"])
    if broken:
        raise AssertionError(f"people, {when}: {'; '.join(broken)}")
    for s in settlements:
        broken = check_invariants(s.population, s.cohorts, s.society)
        if broken:
            raise AssertionError(f"{s.settlementId} {when}: {'; '.join(broken)}")


def advance(state: ScenarioState, days: int, rules: dict[str, Any]) -> tuple[ScenarioState, list[dict[str, Any]]]:
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
    for _ in range(days):
        day += 1
        if day % per_month:
            continue
        month_index = day // per_month - 1
        before = sum(s.population for s in settlements)
        births_before = sum(s.births for s in settlements)
        deaths_before = sum(s.deaths for s in settlements)
        settlements = [_month(s, seed=state.seed, month_index=month_index, rules=rules) for s in settlements]
        settlements, flows = migrate(settlements, rules["simulation"]["migration"])
        if flows:
            moved = {sid for pair in flows for sid in pair}
            days = rules["simulation"]["calendar"]["daysPerMonth"]
            settlements = [s.model_copy(update={"society": update_society(s.society, s.cohorts, rules["society"], days)})
                           if s.settlementId in moved else s for s in settlements]
        settlements, trade, economy = economy_month(settlements, trade, day, rules, state.seed)
        linked = link(economy["incidents"], cast, settlements)
        cast, trade, lives = people_month(cast, settlements, trade, flows, day=day, seed=state.seed, rules=rules)
        cast, trade, events = chronicle([*linked, *lives], cast, trade, seq, day, rules)
        seq += len(events)
        cast, past = with_backstory(cast, seq, day, settlements, rules, state.seed)     # people who came into focus
        seq += len(past)
        economy["events"] = [*events, *past]
        economy["incidents"] = [{**incident, "eventId": e.id} for incident, e in zip([*linked, *lives], events, strict=True)]
        assert_consistent(settlements, cast, trade, rules, f"month {month_index}")
        history.append(HistoryPoint(day=day, population={s.settlementId: s.population for s in settlements},
                                    labour={s.settlementId: s.society.employment.labourSupply for s in settlements},
                                    unemployed={s.settlementId: s.society.employment.unemployed for s in settlements},
                                    bandits=sum(r.bandits for r in trade.routes)))
        employed = sum(s.society.employment.employed for s in settlements)
        supply = sum(s.society.employment.labourSupply for s in settlements)
        months.append({
            "day": day,
            "label": date_for(day - 1, state.startYear, calendar).label[:7],
            "births": sum(s.births for s in settlements) - births_before,
            "deaths": sum(s.deaths for s in settlements) - deaths_before,
            "population": sum(s.population for s in settlements),
            "change": sum(s.population for s in settlements) - before,
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
        "historySeq": seq,
    })
    return new_state, months


def state_checksum(state: ScenarioState) -> str:
    return state_digest(state.model_dump())
