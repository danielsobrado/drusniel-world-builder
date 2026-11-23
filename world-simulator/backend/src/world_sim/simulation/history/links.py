"""
Attaches the named people to the economy's incidents before recording: the master behind
a trader id, the named guards who rode with the caravan, the outlaws on the road. Runs
before the month's lives change, so a master dismissed this month is still found.
"""

from typing import Any

from ..economy.escorts import KIND as ESCORTS
from ..people.contracts import Cast

TRADER_ROLES = {"raid": "caravan-master", "smuggling": "smuggler", "dismissed": "dismissed-master", "opened": "investor",
                "closed": "owner"}


def link(incidents: list[dict[str, Any]], cast: Cast, settlements: list[Any]) -> list[dict[str, Any]]:
    holders = {p.traderId: p.id for p in cast.people if p.traderId}
    guards_by_town: dict[str, list[str]] = {}
    for s in settlements:
        posts = {b.id for b in s.society.businesses if b.kind == ESCORTS}
        guards_by_town[s.settlementId] = sorted(p.id for p in cast.people if p.alive and p.businessId in posts)
    out = []
    for incident in incidents:
        parts: list[dict[str, str]] = list(incident.get("participants") or [])
        trader = incident.get("trader")
        if trader and trader in holders:
            parts.append({"personId": holders[trader], "role": TRADER_ROLES.get(incident["kind"], "trader")})
        if incident["kind"] == "raid":
            guards = guards_by_town.get(incident.get("settlementId", ""), [])[:incident.get("guards", 0)]
            parts += [{"personId": g, "role": "guard"} for g in guards]
            parts += [{"personId": p.id, "role": "bandit"} for p in cast.people
                      if p.alive and p.role == "outlaw" and p.routeId == incident.get("routeId")]
        related = list(incident.get("relatedEntities") or [])
        if trader:
            related.append(trader)
        out.append({**incident, "participants": parts, "relatedEntities": related})
    return out
