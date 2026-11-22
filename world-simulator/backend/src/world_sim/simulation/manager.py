"""
Owns every scenario's live state. All mutations happen on the asyncio event loop
(async API handlers and the run loop), so they never interleave mid-step.
"""

import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .. import log
from ..api.errors import ApiError
from ..world.model import WorldModel
from .calendar import resolve_start_year
from .contracts import CreateScenario, Event, ParentRef, ScenarioMeta, ScenarioState, Scope, SnapshotMeta
from .engine import advance, baseline_state, state_checksum
from .scope import resolve_scope
from .store import ScenarioStore, slugify


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Session:
    meta: ScenarioMeta
    state: ScenarioState
    events: list[Event]
    speed: float = 0.0
    task: asyncio.Task | None = None
    carry: float = 0.0
    dirty: bool = False
    saved_at: float = field(default_factory=time.monotonic)
    error: str | None = None

    @property
    def running(self) -> bool:
        return self.task is not None and not self.task.done()


class ScenarioManager:
    def __init__(self, model: WorldModel):
        self.model = model
        self.config = model.config.simulation
        self.limits = self.config["limits"]
        self.store = ScenarioStore(model.config.root / self.config["storage"])
        self.start_year = resolve_start_year(self.config["calendar"], model.audit["sourceSettings"]["year"])
        self.sessions: dict[str, Session] = {}
        for scenario_id in self.store.ids():
            meta, state, events = self.store.load(scenario_id)
            if state.world.sourceFingerprint != model.audit["identity"]["sourceFingerprint"]:
                log.warn("scenario built from a different source map; loaded read-only state as is", scenarioId=scenario_id)
            self.sessions[scenario_id] = Session(meta, state, events)
        if not self.sessions:
            baseline = self.config["baseline"]
            self.create(CreateScenario(name=baseline["name"], description=baseline.get("description", ""),
                                       scope=Scope(**baseline["scope"]), seed=baseline["seed"]), scenario_id=baseline["id"])

    # ---- queries -------------------------------------------------------
    def session(self, scenario_id: str) -> Session:
        found = self.sessions.get(scenario_id)
        if found is None:
            raise ApiError(404, "not_found", f"No scenario {scenario_id}", {"id": scenario_id})
        return found

    def status(self, s: Session) -> dict[str, Any]:
        return {
            **s.meta.model_dump(),
            "settlementIds": [x.settlementId for x in s.state.settlements],
            "date": s.state.date.model_dump(),
            "running": s.running,
            "speed": s.speed if s.running else 0,
            "population": sum(x.population for x in s.state.settlements),
            "checksum": state_checksum(s.state),
            "snapshots": len(self.store.snapshots(s.meta.id)),
            "error": s.error,
        }

    def list(self) -> list[dict[str, Any]]:
        return [self.status(s) for s in sorted(self.sessions.values(), key=lambda s: s.meta.createdAt + s.meta.id)]

    # ---- mutations -----------------------------------------------------
    def _event(self, s: Session, kind: str, message: str, **data: Any) -> None:
        s.meta = s.meta.model_copy(update={"eventSeq": s.meta.eventSeq + 1})
        s.events.append(Event(seq=s.meta.eventSeq, day=s.state.date.day, date=s.state.date.label, kind=kind, message=message, data=data))
        del s.events[: max(0, len(s.events) - self.limits["maxEvents"])]
        s.dirty = True

    def _persist(self, s: Session) -> None:
        self.store.save_meta(s.meta)
        self.store.save_state(s.meta.id, s.state)
        self.store.save_events(s.meta.id, s.events)
        s.dirty, s.saved_at = False, time.monotonic()

    def _new_id(self, name: str) -> str:
        base = slugify(name)
        candidate, n = base, 2
        while candidate in self.sessions:
            candidate, n = f"{base}-{n}", n + 1
        return candidate

    def create(self, req: CreateScenario, scenario_id: str | None = None) -> Session:
        if len(self.sessions) >= self.limits["maxScenarios"]:
            raise ApiError(409, "limit_reached", f"At most {self.limits['maxScenarios']} scenarios are kept")
        scenario_id = scenario_id or self._new_id(req.name)
        if req.fromScenarioId:
            if not req.fromSnapshotId:
                raise ApiError(400, "invalid_request", "Branching needs fromSnapshotId", {"parameter": "fromSnapshotId"})
            parent = self.session(req.fromScenarioId)
            found = self.store.load_snapshot(parent.meta.id, req.fromSnapshotId)
            if found is None:
                raise ApiError(404, "not_found", f"No snapshot {req.fromSnapshotId}", {"id": req.fromSnapshotId})
            snapshot, snap_state = found
            state = snap_state.model_copy(update={"scenarioId": scenario_id})
            meta = ScenarioMeta(id=scenario_id, name=req.name, description=req.description, scope=parent.meta.scope, seed=state.seed,
                                parent=ParentRef(scenarioId=parent.meta.id, snapshotId=snapshot.id), createdAt=_now())
            session = Session(meta, state, [])
            self._event(session, "branched", f"Branched from {parent.meta.name} at snapshot “{snapshot.label}” ({snapshot.date.label})")
        else:
            scope = req.scope or Scope(type="pilot")
            settlement_ids = resolve_scope(self.model, scope, self.limits["maxScopeSettlements"])
            seed = req.seed if req.seed is not None else self.config["baseline"]["seed"]
            state = baseline_state(self.model, scenario_id=scenario_id, settlement_ids=settlement_ids, seed=seed,
                                   start_year=self.start_year, sim_config=self.config)
            meta = ScenarioMeta(id=scenario_id, name=req.name, description=req.description, scope=scope, seed=seed, createdAt=_now())
            session = Session(meta, state, [])
            self._event(session, "created", f"Created with {len(settlement_ids)} settlements from the imported world")
        self.sessions[scenario_id] = session
        self._persist(session)
        return session

    def _advance(self, s: Session, days: int) -> None:
        s.state, months = advance(s.state, days, self.config)
        for m in months:
            self._event(s, "month", f"{m['label']} closed: {m['births']} births, {m['deaths']} deaths, population {m['population']:,}",
                        births=m["births"], deaths=m["deaths"], population=m["population"])
        s.dirty = True

    def step(self, scenario_id: str, days: int) -> Session:
        s = self.session(scenario_id)
        if s.running:
            raise ApiError(409, "running", "Pause the scenario before stepping it")
        if not 1 <= days <= self.limits["maxStepDays"]:
            raise ApiError(400, "invalid_parameter", f"days must be 1-{self.limits['maxStepDays']}", {"parameter": "days"})
        start = s.state.date.label
        self._advance(s, days)
        self._event(s, "stepped", f"Stepped {days} day{'s' if days != 1 else ''} from {start}", days=days)
        self._persist(s)
        return s

    def run(self, scenario_id: str, speed: float) -> Session:
        s = self.session(scenario_id)
        if speed not in self.config["speeds"]:
            raise ApiError(400, "invalid_parameter", f"speed must be one of {self.config['speeds']}", {"parameter": "speed"})
        s.speed, s.error = speed, None
        if not s.running:
            s.carry = 0.0
            s.task = asyncio.get_running_loop().create_task(self._run_loop(s))
            self._event(s, "run", f"Running at {speed:g} days per second", speed=speed)
        return s

    async def _run_loop(self, s: Session) -> None:
        tick = self.config["runner"]["tickSeconds"]
        try:
            while True:
                await asyncio.sleep(tick)
                s.carry += s.speed * tick
                days, s.carry = int(s.carry), s.carry - int(s.carry)
                if days:
                    self._advance(s, days)
                if s.dirty and time.monotonic() - s.saved_at >= 1.0:
                    self._persist(s)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - a failing run stops with its reason recorded, never silently
            log.error("scenario run failed", exc, scenarioId=s.meta.id)
            s.error = str(exc)
            self._event(s, "error", f"Run stopped: {exc}")
            self._persist(s)

    async def pause(self, scenario_id: str) -> Session:
        s = self.session(scenario_id)
        if s.running:
            s.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await s.task
            self._event(s, "paused", f"Paused at {s.state.date.label}")
        s.task = None
        self._persist(s)
        return s

    def snapshot(self, scenario_id: str, label: str) -> SnapshotMeta:
        s = self.session(scenario_id)
        if len(self.store.snapshots(scenario_id)) >= self.limits["maxSnapshots"]:
            raise ApiError(409, "limit_reached", f"At most {self.limits['maxSnapshots']} snapshots per scenario")
        s.meta = s.meta.model_copy(update={"snapshotSeq": s.meta.snapshotSeq + 1})
        meta = SnapshotMeta(id=f"snap-{s.meta.snapshotSeq:03d}", label=label.strip() or s.state.date.label, date=s.state.date,
                            checksum=state_checksum(s.state), createdAt=_now())
        self.store.save_snapshot(scenario_id, meta, s.state)
        self._event(s, "snapshot", f"Snapshot “{meta.label}” saved", snapshotId=meta.id)
        self._persist(s)
        return meta

    def restore(self, scenario_id: str, snapshot_id: str) -> Session:
        s = self.session(scenario_id)
        if s.running:
            raise ApiError(409, "running", "Pause the scenario before restoring a snapshot")
        found = self.store.load_snapshot(scenario_id, snapshot_id)
        if found is None:
            raise ApiError(404, "not_found", f"No snapshot {snapshot_id}", {"id": snapshot_id})
        meta, state = found
        if state_checksum(state) != meta.checksum:
            raise ApiError(500, "corrupt_snapshot", f"Snapshot {snapshot_id} does not match its checksum")
        s.state = state
        self._event(s, "restored", f"Restored snapshot “{meta.label}” ({meta.date.label})", snapshotId=meta.id)
        self._persist(s)
        return s

    async def shutdown(self) -> None:
        for scenario_id, s in self.sessions.items():
            if s.running:
                await self.pause(scenario_id)
            elif s.dirty:
                self._persist(s)
