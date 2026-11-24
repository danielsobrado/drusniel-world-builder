"""
The validation lab: read-only questions about scenarios. Compare two states, trace an
event's causes and consequences, check that state and history agree, and report how
fast steps and model calls run. It never changes a scenario; replay lives on the
manager because it needs the live state and journal captured together.
"""

import json
import statistics
import time
from collections import deque
from typing import Any

from .compare import compare
from .contracts import ScenarioState
from .history.contracts import HistoryEvent
from .history.validation import check_events
from .manager import ScenarioManager
from .people.checks import check_cast, check_ties
from .society import check_invariants


def _stats(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"mean": None, "p95": None, "last": None}
    ordered = sorted(values)
    return {"mean": round(statistics.fmean(values), 2), "p95": round(ordered[min(len(ordered) - 1, int(0.95 * len(ordered)))], 2),
            "last": round(values[-1], 2)}


def _check(check_id: str, label: str, problems: list[str], checked: int) -> dict[str, Any]:
    return {"id": check_id, "label": label, "passed": not problems, "checked": checked, "problems": problems[:20],
            "problemCount": len(problems)}


class Lab:
    def __init__(self, manager: ScenarioManager, latency: deque | None = None):
        self.manager = manager
        self.latency = latency if latency is not None else deque()

    # ---- comparison ---------------------------------------------------------
    def _ref(self, ref: dict[str, str | None]) -> tuple[ScenarioState, list[HistoryEvent], str]:
        """A scenario's live state, or one of its snapshots, with the history up to it."""
        scenario_id = ref["scenarioId"]
        s = self.manager.session(scenario_id)
        if ref.get("snapshotId"):
            snap, state = self.manager._snapshot_state(scenario_id, ref["snapshotId"])
            name = f"{s.meta.name} · {snap.label}"
        else:
            state, name = s.state, s.meta.name
        # In recording order: the archive sorts by day, and reconstructed pasts (negative days) are numbered when recorded.
        events = sorted(self.manager.archive(scenario_id).query(before=state.historySeq, limit=None), key=lambda e: e.seq)
        return state, events, name

    def compare(self, a: dict[str, str | None], b: dict[str, str | None]) -> dict[str, Any]:
        state_a, events_a, name_a = self._ref(a)
        state_b, events_b, name_b = self._ref(b)
        result = compare(state_a, state_b, events_a, events_b, self.manager.labeller(state_a))
        return {"a": {**a, "name": name_a}, "b": {**b, "name": name_b}, **result}

    # ---- causal trace ---------------------------------------------------------
    def trace(self, scenario_id: str, event_id: str, depth: int = 4, limit: int = 120) -> dict[str, Any] | None:
        """Causes back and consequences forward from one event, breadth first, up to `depth` steps and `limit` events."""
        archive = self.manager.archive(scenario_id)
        root = archive.get(event_id)
        if root is None:
            return None
        nodes: dict[str, tuple[HistoryEvent, int]] = {root.id: (root, 0)}
        edges: set[tuple[str, str]] = set()
        back, forward = [root], [root]
        for step in range(1, depth + 1):
            causes = archive.many(sorted({c for e in back for c in e.causedBy}))
            effects = [(e, x) for e in forward for x in archive.consequences(e)]
            edges |= {(c, e.id) for e in back for c in e.causedBy}
            edges |= {(e.id, x.id) for e, x in effects}
            back = [e for e in causes if e.id not in nodes]
            forward = [x for _, x in effects if x.id not in nodes]
            for e in back:
                nodes[e.id] = (e, -step)
            for x in forward:
                nodes.setdefault(x.id, (x, step))
            if len(nodes) >= limit or not (back or forward):
                break
        return {"root": root.id, "nodes": [{"event": e, "depth": d} for e, d in sorted(nodes.values(), key=lambda n: n[0].seq)][:limit],
                "edges": sorted([a, b] for a, b in edges if a in nodes and b in nodes)}

    # ---- consistency ------------------------------------------------------------
    def validate(self, scenario_id: str) -> dict[str, Any]:
        started = time.perf_counter()
        s = self.manager.session(scenario_id)
        state, rules = s.state, self.manager.rules(s)
        events = self.manager.archive(scenario_id).query(limit=None)
        ids = {e.id for e in events}
        accounting = [f"{x.name}: {p}" for x in state.settlements for p in check_invariants(x.population, x.cohorts, x.society)]
        named = {e.businessId for e in events if e.businessId}
        refs = [f"{p.name} {p.family}: timeline {i}" for p in state.cast.people for i in p.timeline if i not in ids]
        refs += [f"{p.name} {p.family}: knows of {k.eventId}" for p in state.cast.people for k in p.knowledge if k.eventId not in ids]
        refs += [f"{r.id}: made by {r.origin}" for r in state.cast.relationships if r.origin and r.origin.startswith("event:")
                 and r.origin not in ids]
        seqs = sorted(e.seq for e in events)
        archive = [] if seqs == list(range(state.historySeq)) else [
            f"the archive holds {len(seqs)} events numbered {seqs[0] if seqs else '-'}–{seqs[-1] if seqs else '-'}, "
            f"the state expects 0–{state.historySeq - 1}"]
        checks = [
            _check("accounting", "Population, households and jobs add up in every settlement", accounting, len(state.settlements)),
            _check("people", "Named people fit each town's budget and belong to households",
                   check_cast(state.cast, state.settlements, state.trade, rules["simulation"]["people"]),
                   len(state.cast.people)),
            _check("relationships", "Relationships are consistent (spouses, parents, employers)",
                   check_ties(state.cast, rules["simulation"]["people"]["daysPerYear"]),
                   len(state.cast.relationships)),
            _check("archive", "The history archive is complete up to the state's event counter", archive, len(events)),
            _check("history", "Every event names people, places and businesses that exist, at a time they could",
                   check_events(events, state, named), len(events)),
            _check("references", "Timelines, knowledge and relationship origins point at recorded events", refs,
                   sum(len(p.timeline) + len(p.knowledge) for p in state.cast.people)),
        ]
        return {"passed": all(c["passed"] for c in checks), "checks": checks, "replayable": s.meta.journal is not None,
                "seconds": round(time.perf_counter() - started, 2), "date": state.date.label}

    # ---- performance ------------------------------------------------------------------
    def metrics(self, scenario_id: str) -> dict[str, Any]:
        s = self.manager.session(scenario_id)
        steps = list(s.perf)
        per_month = [x["ms"] / x["months"] for x in steps]
        calls = list(self.latency)
        kinds = sorted({c["kind"] for c in calls})
        state = s.state
        return {
            "steps": {"count": len(steps), "months": sum(x["months"] for x in steps), "msPerMonth": _stats(per_month),
                      "recent": steps[-30:]},
            "size": {"people": len(state.cast.people), "alive": sum(p.alive for p in state.cast.people),
                     "relationships": len(state.cast.relationships), "events": state.historySeq,
                     "stateKb": round(len(json.dumps(state.model_dump(), separators=(",", ":"))) / 1024, 1),
                     "journal": len(s.meta.journal) if s.meta.journal is not None else None},
            "llm": {"calls": len(calls), "byKind": {k: {"count": sum(c["kind"] == k for c in calls),
                                                         **_stats([c["seconds"] for c in calls if c["kind"] == k])} for k in kinds},
                    "recent": calls[-20:]},
        }
