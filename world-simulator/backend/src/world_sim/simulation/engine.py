"""Pure scenario engine: build the baseline state and advance it day by day. No I/O."""

from typing import Any

from ..canonical import checksum
from ..world.model import WorldModel
from .calendar import date_for
from .contracts import HistoryPoint, ScenarioState, SettlementState, WorldRef
from .demography import initial_cohorts, run_month


def baseline_state(model: WorldModel, *, scenario_id: str, settlement_ids: list[str], seed: int, start_year: int,
                   sim_config: dict[str, Any]) -> ScenarioState:
    shares = sim_config["demography"]["initialShares"]
    settlements = []
    for sid in settlement_ids:
        s = model.settlements_by_id[sid]
        settlements.append(SettlementState(settlementId=sid, sourceId=s["sourceId"], name=s["name"], population=s["population"],
                                           cohorts=initial_cohorts(s["population"], shares)))
    identity = model.audit["identity"]
    return ScenarioState(
        scenarioId=scenario_id,
        world=WorldRef(mapId=identity["mapId"], sourceFingerprint=identity["sourceFingerprint"]),
        seed=seed,
        startYear=start_year,
        date=date_for(0, start_year, sim_config["calendar"]),
        settlements=settlements,
        history=[HistoryPoint(day=0, population={s.settlementId: s.population for s in settlements})],
    )


def advance(state: ScenarioState, days: int, sim_config: dict[str, Any]) -> tuple[ScenarioState, list[dict[str, Any]]]:
    """Advances `days` days; each month close runs demography. Returns the new state and month summaries."""
    calendar = sim_config["calendar"]
    per_month, per_year = calendar["daysPerMonth"], calendar["monthsPerYear"]
    settlements = list(state.settlements)
    history = list(state.history)
    months: list[dict[str, Any]] = []
    day = state.date.day
    for _ in range(days):
        day += 1
        if day % per_month == 0:
            month_index = day // per_month - 1
            before = sum(s.population for s in settlements)
            births_before = sum(s.births for s in settlements)
            deaths_before = sum(s.deaths for s in settlements)
            settlements = [run_month(s, seed=state.seed, month_index=month_index, params=sim_config["demography"],
                                     months_per_year=per_year) for s in settlements]
            history.append(HistoryPoint(day=day, population={s.settlementId: s.population for s in settlements}))
            months.append({
                "day": day,
                "label": date_for(day - 1, state.startYear, calendar).label[:7],
                "births": sum(s.births for s in settlements) - births_before,
                "deaths": sum(s.deaths for s in settlements) - deaths_before,
                "population": sum(s.population for s in settlements),
                "change": sum(s.population for s in settlements) - before,
            })
    new_state = state.model_copy(update={
        "date": date_for(day, state.startYear, calendar),
        "settlements": settlements,
        "history": history,
    })
    return new_state, months


def state_checksum(state: ScenarioState) -> str:
    return checksum(state.model_dump())
