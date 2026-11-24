"""A light view of a scenario's state for the workbench: everything but the business list, the cast and the caravan log."""

from collections import defaultdict
from typing import Any

from ..simulation.contracts import ScenarioState, SettlementState


def business_summary(s: SettlementState) -> dict[str, Any]:
    professions: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for b in s.society.businesses:
        professions[b.profession][0] += b.staff
        professions[b.profession][1] += b.filled
    opened = [b for b in s.society.businesses if b.openedDay is not None]
    return {
        "count": len(s.society.businesses),
        "professions": [{"profession": p, "posts": v[0], "filled": v[1]} for p, v in sorted(professions.items())],
        "opened": {"posts": sum(b.staff for b in opened), "filled": sum(b.filled for b in opened)},
        "guardPosts": sum(b.filled for b in s.society.businesses if b.kind == "caravan-guard"),
    }


def state_summary(state: ScenarioState) -> dict[str, Any]:
    settlements = []
    for s in state.settlements:
        row = s.model_dump(exclude={"society": {"businesses"}})
        row["society"]["businesses"] = []
        settlements.append({**row, "businessSummary": business_summary(s)})
    trade = {"routes": [r.model_dump() for r in state.trade.routes], "traders": [t.model_dump() for t in state.trade.traders]}
    return {**state.model_dump(exclude={"settlements", "trade", "cast", "travel"}),
            "settlements": settlements, "trade": trade, "populationInTransit": state.travel.population}
