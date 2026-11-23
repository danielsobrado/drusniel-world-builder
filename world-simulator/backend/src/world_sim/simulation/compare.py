"""
Before/after comparison of two scenario states (two scenarios, or a scenario and one of
its snapshots): settlement measures, production, routes, the named people whose lives
went differently, and the history each recorded after the point where they diverged.
"""

from collections import Counter
from typing import Any

from .contracts import ScenarioState, SettlementState
from .history.contracts import HistoryEvent


def _measures(s: SettlementState) -> dict[str, float]:
    e = s.society.employment
    return {"population": s.population, "employed": e.employed, "unemployed": e.unemployed, "businesses": len(s.society.businesses),
            "foodSecurity": round(s.economy.food.security, 3), "treasury": round(s.economy.treasury, 1),
            "tradeBalance": round(s.economy.tradeBalance, 1), "shortages": len(s.economy.shortages)}


def _pair(a: float | None, b: float | None) -> dict[str, float | None]:
    return {"a": a, "b": b, "delta": round(b - a, 4) if a is not None and b is not None else None}


def _settlements(a: ScenarioState, b: ScenarioState) -> list[dict[str, Any]]:
    other = {s.settlementId: s for s in b.settlements}
    rows = []
    for s in a.settlements:
        t = other.get(s.settlementId)
        if t is None:
            continue
        ma, mb = _measures(s), _measures(t)
        made_a = {line.good: line.produced for line in s.economy.production}
        made_b = {line.good: line.produced for line in t.economy.production}
        production = [{"good": g, **_pair(made_a.get(g, 0.0), made_b.get(g, 0.0))} for g in sorted(set(made_a) | set(made_b))
                      if abs(made_a.get(g, 0.0) - made_b.get(g, 0.0)) > 1e-6]
        rows.append({"settlementId": s.settlementId, "name": s.name, "measures": {k: _pair(ma[k], mb[k]) for k in ma},
                     "production": production})
    return rows


def _person(p: Any, workplaces: dict[str, str], towns: dict[str, str]) -> dict[str, Any]:
    return {"alive": p.alive, "role": p.role, "settlement": towns.get(p.settlementId, p.settlementId),
            "workplace": workplaces.get(p.businessId or "", p.businessId)}


def _people(a: ScenarioState, b: ScenarioState, limit: int) -> dict[str, Any]:
    towns = {s.settlementId: s.name for s in [*a.settlements, *b.settlements]}
    places = {x.id: x.name for s in [*a.settlements, *b.settlements] for x in s.society.businesses}
    in_b = {p.id: p for p in b.cast.people}
    changed, counts = [], Counter()
    for p in a.cast.people:
        q = in_b.get(p.id)
        if q is None:
            continue
        before, after = _person(p, places, towns), _person(q, places, towns)
        diffs = [k for k in before if before[k] != after[k]]
        if diffs:
            counts.update(diffs)
            changed.append({"personId": p.id, "name": f"{p.name} {p.family}", "changed": diffs, "a": before, "b": after})
    ids_a = {p.id for p in a.cast.people}
    return {"compared": len(ids_a & set(in_b)), "onlyA": len(ids_a - set(in_b)), "onlyB": len(set(in_b) - ids_a),
            "changedBy": dict(counts), "changedCount": len(changed), "changed": changed[:limit]}


def _routes(a: ScenarioState, b: ScenarioState) -> list[dict[str, Any]]:
    towns = {s.settlementId: s.name for s in a.settlements}
    other = {r.id: r for r in b.trade.routes}
    return [{"routeId": r.id, "name": f"{towns.get(r.settlementId, r.settlementId)} – {r.centerName}", "mode": r.mode,
             "bandits": _pair(r.bandits, other[r.id].bandits)} for r in a.trade.routes if r.id in other]


def diverged(a: list[HistoryEvent], b: list[HistoryEvent]) -> int:
    """How many events the two histories share from the start (same number, same record)."""
    n = 0
    for x, y in zip(a, b, strict=False):
        if x.model_dump_json() != y.model_dump_json():
            break
        n += 1
    return n


def _history(a: list[HistoryEvent], b: list[HistoryEvent], labels: Any, limit: int) -> dict[str, Any]:
    shared = diverged(a, b)
    after_a, after_b = a[shared:], b[shared:]
    kinds_a, kinds_b = Counter(e.kind for e in after_a), Counter(e.kind for e in after_b)
    order = sorted(set(kinds_a) | set(kinds_b), key=lambda k: (-(kinds_a[k] + kinds_b[k]), k))
    kinds = [{"kind": k, **_pair(kinds_a[k], kinds_b[k])} for k in order]

    def notable(events: list[HistoryEvent]) -> list[dict[str, Any]]:
        return [{"id": e.id, "date": labels(e.day), "kind": e.kind, "source": e.source, "summary": e.summary}
                for e in events if e.importance >= 4][:limit]

    return {"shared": shared, "afterA": len(after_a), "afterB": len(after_b), "kinds": kinds,
            "notableA": notable(after_a), "notableB": notable(after_b)}


def compare(a: ScenarioState, b: ScenarioState, events_a: list[HistoryEvent], events_b: list[HistoryEvent], labels: Any,
            limit: int = 100) -> dict[str, Any]:
    return {"dates": {"a": a.date.label, "b": b.date.label, "same": a.date.day == b.date.day},
            "settlements": _settlements(a, b), "routes": _routes(a, b), "people": _people(a, b, limit),
            "history": _history(events_a, events_b, labels, limit)}
