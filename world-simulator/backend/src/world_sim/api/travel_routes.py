"""Route geometry and active or recently completed journeys for the workbench."""

from collections import defaultdict
from collections.abc import Callable

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from ..simulation.economy.contracts import Caravan
from ..simulation.manager import ScenarioManager
from .errors import ApiError


def _convoy(c: Caravan, day: int, label: Callable[[int], str], names: dict[str, str], *, arrived: bool = False) -> dict:
    delay_from = c.departDay + max(1, (c.arriveDay - c.departDay - c.delayDays) // 2)
    status = "arrived" if arrived else "queued" if day < c.departDay else "traveling"
    if status == "traveling" and delay_from <= day < delay_from + c.delayDays:
        status = "delayed"
    item = c.model_dump()
    if not arrived and day < delay_from:
        item.update(lost={}, delayReason=None, delayDays=0)
    return {**item, "status": status, "carrier": names.get(c.carrierId),
            "departure": label(c.departDay), "arrival": label(c.arriveDay)}


def travel_router(manager: ScenarioManager, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")

    def overview(scenario_id: str) -> dict:
        state = manager.session(scenario_id).state
        label = manager.labeller(state)
        names = {s.settlementId: s.name for s in state.settlements}
        names.update({m.centerSettlementId: m.centerName for m in state.trade.markets})
        cast = {p.id: f"{p.name} {p.family}" for p in state.cast.people}
        routes = {r.id: r.model_dump() for r in state.travel.routes}
        routes.update({r.id: {**r.path.model_dump(), "id": r.id} for r in state.trade.routes if r.path})
        journeys = []
        flows: dict[tuple[str, str], dict[str, int]] = defaultdict(lambda: {"traveling": 0, "arrived": 0, "returned": 0})
        for j in state.travel.journeys:
            flow = flows[(j.originId, j.destinationId)]
            flow["traveling" if j.active else j.status] += j.population
            journeys.append({**j.model_dump(), "active": j.active, "population": j.population,
                             "origin": names[j.originId], "destination": names[j.destinationId],
                             "departure": label(j.departDay), "arrival": label(j.arriveDay),
                             "companions": [{"id": pid, "name": cast[pid]} for pid in j.personIds if pid in cast],
                             "incidents": [{**i.model_dump(), "date": label(i.day)} for i in j.incidents]})
        convoys = [_convoy(c, state.date.day, label, cast) for c in state.trade.caravans]
        return {"day": state.date.day, "names": names, "routes": list(routes.values()),
                "populationInTransit": state.travel.population, "journeys": journeys, "caravans": convoys,
                "flows": [{"originId": a, "destinationId": b, "origin": names[a], "destination": names[b], **totals}
                          for (a, b), totals in sorted(flows.items())]}

    @router.get("/scenarios/{scenario_id}/travel")
    def travel(scenario_id: str) -> JSONResponse:
        return reply(overview(scenario_id))

    @router.get("/scenarios/{scenario_id}/travel/{travel_id}")
    def detail(scenario_id: str, travel_id: str) -> JSONResponse:
        data = overview(scenario_id)
        for kind in ("journeys", "caravans", "routes"):
            if found := next((item for item in data[kind] if item["id"] == travel_id), None):
                route = next((r for r in data["routes"] if r["id"] == found.get("routeId")), None)
                return reply({"kind": kind, "item": found, "route": route, "names": data["names"]})
        state = manager.session(scenario_id).state
        if delivered := next((c for c in state.trade.delivered if c.id == travel_id), None):
            cast = {p.id: f"{p.name} {p.family}" for p in state.cast.people}
            item = _convoy(delivered, state.date.day, manager.labeller(state), cast, arrived=True)
            route = next((r for r in data["routes"] if r["id"] == delivered.routeId), None)
            return reply({"kind": "caravans", "item": item, "route": route, "names": data["names"]})
        raise ApiError(404, "not_found", f"No travel record {travel_id} in this scenario")

    return router
