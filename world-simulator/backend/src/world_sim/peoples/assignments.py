"""Validate scenario-specific choices before freezing the ruleset."""

from ..api.errors import ApiError
from .catalog import validate_weights
from .contracts import Assignment


def assigned_rules(rules: dict, assignments: dict[str, Assignment], settlement_ids: list[str]) -> dict:
    peoples = rules["peoples"]
    rows = {}
    for sid, assignment in assignments.items():
        if sid not in settlement_ids:
            raise ApiError(400, "invalid_assignment", f"Settlement {sid} is outside the scenario scope")
        data = assignment.model_dump(exclude_unset=True)
        if assignment.cultureId and assignment.cultureSeedId:
            raise ApiError(400, "invalid_assignment", f"{sid} needs one culture or one culture seed")
        for field, status in (("cultureId", "core"), ("cultureSeedId", "seed")):
            if (key := data.get(field)) is not None and peoples["cultures"].get(key, {}).get("status") != status:
                raise ApiError(400, "invalid_assignment", f"Unknown {field} {key}")
        if assignment.ancestryWeights is not None:
            try:
                validate_weights(assignment.ancestryWeights, peoples["ancestries"], sid)
            except ValueError as exc:
                raise ApiError(400, "invalid_assignment", str(exc)) from exc
        rows[sid] = data
    return {**rules, "peoples": {**peoples, "assignments": rows}}
