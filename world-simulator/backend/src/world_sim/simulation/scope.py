"""Which settlements a scenario simulates."""

from ..api.errors import ApiError
from ..world.model import WorldModel
from .contracts import Scope


def resolve_scope(model: WorldModel, scope: Scope, max_settlements: int) -> list[str]:
    settlements = model.audit["settlements"]
    if scope.type == "pilot":
        ids = [r["settlementId"] for r in model.pilot["roles"]]
    elif scope.type == "state":
        ids = [s["id"] for s in settlements if s["stateId"] == scope.id]
    elif scope.type == "province":
        ids = [s["id"] for s in settlements if s["provinceId"] == scope.id]
    else:
        ids = list(dict.fromkeys(scope.settlementIds or []))
        unknown = [i for i in ids if i not in model.settlements_by_id]
        if unknown:
            raise ApiError(400, "invalid_scope", f"Unknown settlement ids: {', '.join(unknown[:5])}", {"parameter": "scope"})
    if not ids:
        raise ApiError(400, "invalid_scope", f"Scope {scope.type} {scope.id or ''} contains no settlements".strip(), {"parameter": "scope"})
    if len(ids) > max_settlements:
        raise ApiError(400, "invalid_scope", f"Scope has {len(ids)} settlements; the limit is {max_settlements}",
                       {"parameter": "scope", "limit": max_settlements})
    return sorted(ids, key=lambda i: model.settlements_by_id[i]["sourceId"])
