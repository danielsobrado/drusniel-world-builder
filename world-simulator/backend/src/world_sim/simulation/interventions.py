"""
Events a designer injects into a scenario: a business lost to disaster, a spoiled granary,
a surge of outlaws on a route. Each is applied at the scenario's current day, recorded
as canonical history (source "intervention") and chronicled like a month's events, so
the town hears of it and the people involved remember it. Everything after that, the
lost output, the hardship and the raids, is the ordinary simulation's doing.
"""

from types import SimpleNamespace
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .contracts import ScenarioState
from .engine import assert_consistent
from .history.chronicle import chronicle
from .history.contracts import HistoryEvent
from .people.notes import note
from .people.relationships import Ties
from .society import update_society


class Intervention(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["disaster", "granary-loss", "bandit-surge"]
    businessId: str | None = None                       # disaster
    cause: Literal["collapse", "fire", "flood"] = "collapse"
    settlementId: str | None = None                     # granary-loss
    share: float = Field(0.5, gt=0, le=1)               # granary-loss: part of the store spoiled
    routeId: str | None = None                          # bandit-surge
    bandits: int = Field(5, ge=1, le=200)
    note: str = Field("", max_length=200)               # the designer's own words, kept with the event


class InvalidIntervention(ValueError):
    pass


def _find(items: list[Any], key: str, value: str | None, what: str) -> Any:
    found = next((x for x in items if getattr(x, key) == value), None)
    if found is None:
        raise InvalidIntervention(f"No {what} {value} in this scenario")
    return found


def _kept(businesses: list[Any], lost: Any) -> float:
    posts = sum(b.staff for b in businesses if b.good == lost.good)
    return 1 - lost.staff / posts if posts else 1.0


def _capacity_lost(econ: Any, businesses: list[Any], lost: Any) -> Any:
    """An Azgaar production line is worked by all the businesses making its good; losing one loses its share of the capacity
    (and of the inputs that capacity used). Staffing alone would not show it: the survivors stay fully staffed."""
    if not lost.good:
        return econ
    keep = _kept(businesses, lost)
    def scaled(line: Any) -> Any:
        inputs = {g: round(u * keep, 4) for g, u in line.inputs.items()}
        return line.model_copy(update={"units": round(line.units * keep, 4), "inputs": inputs})

    lines = [scaled(line) if line.good == lost.good and line.source != "hinterland" else line for line in econ.production]
    return econ.model_copy(update={"production": lines})


def _disaster(state: ScenarioState, spec: Intervention, cfg: dict[str, Any], rules: dict[str, Any], seq: int) -> tuple[ScenarioState, list]:
    town = next((s for s in state.settlements if any(b.id == spec.businessId for b in s.society.businesses)), None)
    if town is None:
        raise InvalidIntervention(f"No business {spec.businessId} in this scenario")
    business = _find(town.society.businesses, "id", spec.businessId, "business")
    day = state.date.day
    cause_id = f"event:{seq}"
    verb = cfg["causes"][spec.cause]
    incidents = [{"kind": "disaster", "message": f"{business.name} {verb}" + (f": {spec.note}" if spec.note else ""),
                  "settlementId": town.settlementId, "businessId": business.id,
                  "facts": {"cause": spec.cause, "posts": business.staff, "workers": business.filled, "good": business.good},
                  "effects": [{"entityId": business.id, "kind": "destroyed", "severity": 1.0}]}]
    # Named workers lose their posts now, with the disaster on record as the reason.
    ties = Ties(state.cast.relationships, state.cast.relSeq)
    month = SimpleNamespace(day=day, recent=rules["simulation"]["history"]["recentEvents"], incidents=[])
    people = []
    for p in state.cast.people:
        if p.alive and p.role == "worker" and p.businessId == business.id:
            ties.end(p.id, day, {"employer"}, entity=business.id)
            p = note(p, month, "lost-work", f"Lost work: {business.name} {verb}", role="unemployed", businessId=None, profession=None,
                     idleMonths=0, related={"businessId": business.id, "causedBy": [cause_id], "facts": {"closed": True}})
        people.append(p)
    incidents += month.incidents
    society = town.society.model_copy(update={"businesses": [b for b in town.society.businesses if b.id != business.id]})
    society = update_society(society, town.cohorts, rules["society"], rules["simulation"]["calendar"]["daysPerMonth"])
    econ = _capacity_lost(town.economy, town.society.businesses, business)
    incidents[0]["facts"]["capacityLost"] = round(1 - _kept(town.society.businesses, business), 4) if business.good else 0.0
    settlements = [s.model_copy(update={"society": society, "economy": econ}) if s.settlementId == town.settlementId else s
                   for s in state.settlements]
    traders = [t.model_copy(update={"owns": [x for x in t.owns if x != business.id]}) if business.id in t.owns else t
               for t in state.trade.traders]
    cast = state.cast.model_copy(update={"people": people, "relationships": ties.items})
    return state.model_copy(update={"settlements": settlements, "cast": cast,
                                    "trade": state.trade.model_copy(update={"traders": traders})}), incidents


def _granary(state: ScenarioState, spec: Intervention, rules: dict[str, Any]) -> tuple[ScenarioState, list]:
    town = _find(state.settlements, "settlementId", spec.settlementId, "settlement")
    good = rules["economy"]["food"]["good"]
    store = town.economy.inventory.get(good, 0.0)
    lost = round(store * spec.share, 4)
    econ = town.economy.model_copy(update={"inventory": {**town.economy.inventory, good: round(store - lost, 4)}})
    settlements = [s.model_copy(update={"economy": econ}) if s is town else s for s in state.settlements]
    incident = {"kind": "granary-loss", "message": f"Blight spoiled {spec.share:.0%} of {town.name}'s granary ({lost:,.0f} rations)"
                + (f": {spec.note}" if spec.note else ""), "settlementId": town.settlementId,
                "facts": {"share": spec.share, "rationsLost": lost, "rationsLeft": round(store - lost, 4)},
                "effects": [{"entityId": town.settlementId, "kind": "food-lost", "severity": spec.share}]}
    return state.model_copy(update={"settlements": settlements}), [incident]


def _surge(state: ScenarioState, spec: Intervention) -> tuple[ScenarioState, list]:
    route = _find(state.trade.routes, "id", spec.routeId, "route")
    band = "pirates" if route.mode == "sea" else "bandits"
    way = "sea lane" if route.mode == "sea" else "road"
    routes = [r.model_copy(update={"bandits": r.bandits + spec.bandits}) if r is route else r for r in state.trade.routes]
    incident = {"kind": "bandit-surge", "message": f"{spec.bandits} more {band} gathered on the {way} to {route.centerName}"
                + (f": {spec.note}" if spec.note else ""), "settlementId": route.settlementId, "routeId": route.id,
                "facts": {"added": spec.bandits, "before": route.bandits},
                "effects": [{"entityId": route.id, "kind": "danger", "severity": min(1.0, spec.bandits / 20)}]}
    return state.model_copy(update={"trade": state.trade.model_copy(update={"routes": routes})}), [incident]


def intervene(state: ScenarioState, spec: Intervention, rules: dict[str, Any]) -> tuple[ScenarioState, list[HistoryEvent]]:
    """Applies the intervention at the current day; returns the new state and the events recorded."""
    cfg = rules["simulation"]["interventions"][spec.kind]
    seq = state.historySeq
    if spec.kind == "disaster":
        state, incidents = _disaster(state, spec, cfg, rules, seq)
    elif spec.kind == "granary-loss":
        state, incidents = _granary(state, spec, rules)
    else:
        state, incidents = _surge(state, spec)
    incidents[0] |= {k: cfg[k] for k in ("category", "importance", "visibility")}
    cast, trade, events = chronicle(incidents[:1], state.cast, state.trade, seq, state.date.day, rules, source="intervention",
                                    precision="day")
    cast, trade, more = chronicle(incidents[1:], cast, trade, seq + 1, state.date.day, rules, precision="day")
    events += more
    state = state.model_copy(update={"cast": cast, "trade": trade, "historySeq": seq + len(events)})
    assert_consistent(state.settlements, state.cast, state.trade, rules, f"after {spec.kind}")
    return state, events
