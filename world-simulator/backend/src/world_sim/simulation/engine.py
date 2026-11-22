"""Pure scenario engine: build the baseline state and advance it day by day. No I/O."""

from typing import Any

from ..canonical import state_digest
from ..world.model import WorldModel
from .calendar import date_for
from .contracts import HistoryPoint, ScenarioState, SettlementState, WorldRef
from .demography import initial_cohorts, run_month
from .society import check_invariants, initial_society, update_society


def baseline_settlement(model: WorldModel, settlement_id: str, society_cfg: dict[str, Any], shares: dict[str, float]) -> SettlementState:
    record = model.settlements_by_id[settlement_id]
    cohorts = initial_cohorts(record["population"], shares)
    return SettlementState(settlementId=settlement_id, sourceId=record["sourceId"], name=record["name"],
                           population=record["population"], cohorts=cohorts,
                           society=initial_society(record, cohorts, society_cfg))


def baseline_state(model: WorldModel, *, scenario_id: str, settlement_ids: list[str], seed: int, start_year: int,
                   sim_config: dict[str, Any], society_cfg: dict[str, Any]) -> ScenarioState:
    shares = sim_config["demography"]["initialShares"]
    settlements = [baseline_settlement(model, sid, society_cfg, shares) for sid in settlement_ids]
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


def _month(settlement: SettlementState, *, seed: int, month_index: int, sim_config: dict[str, Any],
           society_cfg: dict[str, Any]) -> SettlementState:
    after = run_month(settlement, seed=seed, month_index=month_index, params=sim_config["demography"],
                      months_per_year=sim_config["calendar"]["monthsPerYear"])
    after = after.model_copy(update={"society": update_society(after.society, after.cohorts, society_cfg)})
    broken = check_invariants(after.population, after.cohorts, after.society)
    if broken:
        raise AssertionError(f"{settlement.settlementId} month {month_index}: {'; '.join(broken)}")
    return after


def _bounded(history: list[HistoryPoint], limit: int) -> list[HistoryPoint]:
    """Keeps the baseline point and the newest `limit - 1` month closes."""
    return history if len(history) <= limit else [history[0], *history[len(history) - limit + 1:]]


def advance(state: ScenarioState, days: int, sim_config: dict[str, Any],
            society_cfg: dict[str, Any]) -> tuple[ScenarioState, list[dict[str, Any]]]:
    """Advances `days` days; each month close runs demography and re-derives society. Returns month summaries too."""
    calendar = sim_config["calendar"]
    per_month = calendar["daysPerMonth"]
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
            settlements = [_month(s, seed=state.seed, month_index=month_index, sim_config=sim_config, society_cfg=society_cfg)
                           for s in settlements]
            history.append(HistoryPoint(day=day, population={s.settlementId: s.population for s in settlements}))
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
            })
    new_state = state.model_copy(update={
        "date": date_for(day, state.startYear, calendar),
        "settlements": settlements,
        "history": _bounded(history, sim_config["limits"]["maxHistoryPoints"]),
    })
    return new_state, months


def state_checksum(state: ScenarioState) -> str:
    return state_digest(state.model_dump())
