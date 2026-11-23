"""
Owns every scenario's live state. All mutations happen on the asyncio event loop
(async API handlers and the run loop), so they never interleave mid-step.

A scenario saved against a different source map stays visible but read-only: it can be
inspected, never advanced, snapshotted, restored or branched, until it is migrated.
"""

import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .. import log
from ..api.errors import ApiError
from ..canonical import checksum
from ..world.model import WorldModel
from .calendar import date_for, resolve_start_year
from .contracts import STATE_SCHEMA_VERSION, CreateScenario, Event, ParentRef, ScenarioMeta, ScenarioState, Scope, SnapshotMeta
from .engine import advance, baseline_state, state_checksum
from .migrations import IncompatibleState, migrate_state
from .scope import resolve_scope
from .store import ScenarioStore, slugify


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


@dataclass
class Session:
    meta: ScenarioMeta
    state: ScenarioState
    events: list[Event]
    read_only: str | None = None      # why the scenario cannot be changed, if it cannot
    speed: float = 0.0
    task: asyncio.Task | None = None
    carry: float = 0.0
    dirty: bool = False
    saved_at: float = field(default_factory=time.monotonic)
    error: str | None = None
    _digest: tuple[int, str] | None = None

    @property
    def checksum(self) -> str:
        """State digest, recomputed only when the state object changes."""
        if self._digest is None or self._digest[0] != id(self.state):
            self._digest = (id(self.state), state_checksum(self.state))
        return self._digest[1]

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
        self.fingerprint = model.audit["identity"]["sourceFingerprint"]
        self.sessions: dict[str, Session] = {}
        self.unloadable: dict[str, str] = {}
        for scenario_id in self.store.ids():
            self._load(scenario_id)
        if not self.sessions and not self.unloadable:
            baseline = self.config["baseline"]
            self.create(CreateScenario(name=baseline["name"], description=baseline.get("description", ""),
                                       scope=Scope(**baseline["scope"]), seed=baseline["seed"]), scenario_id=baseline["id"])

    def _load(self, scenario_id: str) -> None:
        try:
            raw_meta, raw_state, raw_events, file_format = self.store.load(scenario_id)
            foreign = raw_state.get("world", {}).get("sourceFingerprint") != self.fingerprint
            state, stored_schema = migrate_state(raw_state, self.model)
        except (IncompatibleState, KeyError, ValueError) as exc:
            log.error("scenario cannot be loaded; files left untouched", exc, scenarioId=scenario_id)
            self.unloadable[scenario_id] = str(exc)
            return
        session = Session(ScenarioMeta(**raw_meta), state, [Event(**e) for e in raw_events])
        if foreign:
            session.read_only = ("Saved against a different source map "
                                 f"({state.world.sourceFingerprint[:15]}…); inspect only until migrated.")
            log.warn("scenario from another source map loaded read-only", scenarioId=scenario_id)
        elif stored_schema < STATE_SCHEMA_VERSION or file_format < 2:
            self._event(session, "migrated", f"Upgraded saved state from schema v{stored_schema} to v{STATE_SCHEMA_VERSION}",
                        fromSchema=stored_schema)
            self._persist(session)
        self.sessions[scenario_id] = session

    # ---- queries -------------------------------------------------------
    def session(self, scenario_id: str) -> Session:
        found = self.sessions.get(scenario_id)
        if found is None:
            raise ApiError(404, "not_found", f"No scenario {scenario_id}", {"id": scenario_id})
        return found

    def writable(self, scenario_id: str) -> Session:
        s = self.session(scenario_id)
        if s.read_only:
            raise ApiError(409, "read_only", s.read_only, {"id": scenario_id})
        return s

    def status(self, s: Session) -> dict[str, Any]:
        return {
            **s.meta.model_dump(),
            "schemaVersion": s.state.schemaVersion,
            "settlementIds": [x.settlementId for x in s.state.settlements],
            "date": s.state.date.model_dump(),
            "running": s.running,
            "speed": s.speed if s.running else 0,
            "population": sum(x.population for x in s.state.settlements),
            "checksum": s.checksum,
            "snapshots": len(self.store.snapshots(s.meta.id)),
            "readOnly": s.read_only,
            "error": s.error,
        }

    def statuses(self) -> list[dict[str, Any]]:
        return [self.status(s) for s in sorted(self.sessions.values(), key=lambda s: s.meta.createdAt + s.meta.id)]

    def snapshot_list(self, scenario_id: str) -> list[dict[str, Any]]:
        self.session(scenario_id)
        return self.store.snapshots(scenario_id)

    def _snapshot_state(self, scenario_id: str, snapshot_id: str) -> tuple[SnapshotMeta, ScenarioState]:
        found = self.store.load_snapshot(scenario_id, snapshot_id)
        if found is None:
            raise ApiError(404, "not_found", f"No snapshot {snapshot_id}", {"id": snapshot_id})
        raw_meta, raw_state = found
        meta = SnapshotMeta(**raw_meta)
        # PR2 snapshots carry the 8-hex FNV of their v1 state; newer ones the digest of the parsed state.
        legacy = len(meta.checksum) == 8 and checksum(raw_state) == meta.checksum
        try:
            state, stored = migrate_state(raw_state, self.model)
        except IncompatibleState as exc:
            raise ApiError(409, "incompatible_snapshot", str(exc), {"id": snapshot_id}) from exc
        if not legacy and (stored != STATE_SCHEMA_VERSION or state_checksum(state) != meta.checksum):
            raise ApiError(500, "corrupt_snapshot", f"Snapshot {snapshot_id} does not match its checksum")
        return meta, state

    # ---- mutations -----------------------------------------------------
    def _event(self, s: Session, kind: str, message: str, at_day: int | None = None, **data: Any) -> None:
        """Logs an event, dated `at_day` (a month close inside a longer step) or the scenario's current date."""
        date = s.state.date if at_day is None else date_for(at_day, s.state.startYear, self.config["calendar"])
        s.meta = s.meta.model_copy(update={"eventSeq": s.meta.eventSeq + 1})
        s.events.append(Event(seq=s.meta.eventSeq, day=date.day, date=date.label, kind=kind, message=message, data=data))
        del s.events[: max(0, len(s.events) - self.limits["maxEvents"])]
        s.dirty = True

    def _persist(self, s: Session) -> None:
        self.store.save(s.meta.id, s.meta.model_dump(), s.state.model_dump(), [e.model_dump() for e in s.events])
        s.dirty, s.saved_at = False, time.monotonic()

    def _new_id(self, name: str) -> str:
        base = slugify(name)
        candidate, n = base, 2
        while candidate in self.sessions or candidate in self.unloadable:
            candidate, n = f"{base}-{n}", n + 1
        return candidate

    def create(self, req: CreateScenario, scenario_id: str | None = None) -> Session:
        if len(self.sessions) >= self.limits["maxScenarios"]:
            raise ApiError(409, "limit_reached", f"At most {self.limits['maxScenarios']} scenarios are kept")
        scenario_id = scenario_id or self._new_id(req.name)
        if req.fromScenarioId:
            if not req.fromSnapshotId:
                raise ApiError(400, "invalid_request", "Branching needs fromSnapshotId", {"parameter": "fromSnapshotId"})
            parent = self.writable(req.fromScenarioId)
            snapshot, snap_state = self._snapshot_state(parent.meta.id, req.fromSnapshotId)
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
                                   start_year=self.start_year)
            meta = ScenarioMeta(id=scenario_id, name=req.name, description=req.description, scope=scope, seed=seed, createdAt=_now())
            session = Session(meta, state, [])
            businesses = sum(len(s.society.businesses) for s in state.settlements)
            self._event(session, "created",
                        f"Created with {len(settlement_ids)} settlements and {businesses} businesses from the imported world")
        self.sessions[scenario_id] = session
        self._persist(session)
        return session

    def _advance(self, s: Session, days: int) -> None:
        s.state, months = advance(s.state, days, self.model.config.rules)
        for m in months:
            for incident in m["incidents"]:     # what happened during the month, then its close
                self._event(s, incident["kind"], incident["message"], at_day=m["day"], trader=incident.get("trader"),
                            value=incident.get("value"))
            self._event(s, "month", f"{m['label']} closed: {m['births']} births, {m['deaths']} deaths, population {m['population']:,}, "
                        f"{m['unemployed']:,} without work, {m['caravans']} caravans, {m['shortages']} shortages",
                        at_day=m["day"], births=m["births"], deaths=m["deaths"], population=m["population"], unemployed=m["unemployed"],
                        caravans=m["caravans"], shortages=m["shortages"], foodSecurity=m["foodSecurity"], bandits=m["bandits"])
        s.dirty = True

    def step(self, scenario_id: str, days: int) -> Session:
        s = self.writable(scenario_id)
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
        s = self.writable(scenario_id)
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
        if not s.read_only:
            self._persist(s)
        return s

    def snapshot(self, scenario_id: str, label: str) -> SnapshotMeta:
        s = self.writable(scenario_id)
        if len(self.store.snapshots(scenario_id)) >= self.limits["maxSnapshots"]:
            raise ApiError(409, "limit_reached", f"At most {self.limits['maxSnapshots']} snapshots per scenario")
        s.meta = s.meta.model_copy(update={"snapshotSeq": s.meta.snapshotSeq + 1})
        meta = SnapshotMeta(id=f"snap-{s.meta.snapshotSeq:03d}", label=label.strip() or s.state.date.label, date=s.state.date,
                            checksum=s.checksum, createdAt=_now())
        self.store.save_snapshot(scenario_id, meta.model_dump(), s.state.model_dump())
        self._event(s, "snapshot", f"Snapshot “{meta.label}” saved", snapshotId=meta.id)
        self._persist(s)
        return meta

    def restore(self, scenario_id: str, snapshot_id: str) -> Session:
        s = self.writable(scenario_id)
        if s.running:
            raise ApiError(409, "running", "Pause the scenario before restoring a snapshot")
        meta, state = self._snapshot_state(scenario_id, snapshot_id)
        s.state = state
        self._event(s, "restored", f"Restored snapshot “{meta.label}” ({meta.date.label})", snapshotId=meta.id)
        self._persist(s)
        return s

    async def shutdown(self) -> None:
        for scenario_id, s in self.sessions.items():
            if s.running:
                await self.pause(scenario_id)
            elif s.dirty and not s.read_only:
                self._persist(s)
