"""
Owns every scenario's live state. All mutations happen on the asyncio event loop
(async API handlers and the run loop), so they never interleave mid-step.

A scenario saved against a different source map stays visible but read-only: it can be
inspected, never advanced, snapshotted, restored or branched, until it is migrated.
"""

import asyncio
import time
from collections import deque
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from .. import log
from ..api.errors import ApiError
from ..canonical import checksum, state_digest
from ..peoples.assignments import assigned_rules
from ..world.model import WorldModel
from .calendar import date_for, resolve_start_year
from .contracts import STATE_SCHEMA_VERSION, CreateScenario, Event, ParentRef, ScenarioMeta, ScenarioState, Scope, SnapshotMeta
from .engine import advance_frames, baseline_state, state_checksum
from .history.archive import HistoryArchive
from .history.contracts import HistoryEvent
from .interventions import Intervention, InvalidIntervention, intervene
from .migrations import IncompatibleState, migrate_state
from .phase_timings import PhaseTimings
from .replay import event_digest, player_event, replay, with_past
from .rules import complete, fingerprint, freeze
from .scope import resolve_scope
from .store import ScenarioStore, slugify
from .travel_news import expire, remember, report_ids


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
    stopping: bool = False
    busy: bool = False                # a step is being computed off the event loop
    perf: deque = field(default_factory=lambda: deque(maxlen=200))   # recent step timings
    _digest: tuple[ScenarioState, str] | None = None
    _revision_state: ScenarioState | None = None
    _revision_refs: dict[str, tuple[Any, ...]] = field(default_factory=dict)
    _revisions: dict[str, int] = field(default_factory=dict)

    def domain_revisions(self) -> dict[str, int]:
        if self._revision_state is not self.state:
            state = self.state
            refs = {
                "businesses": tuple(s.society.businesses for s in state.settlements),
                "peoples": (*state.settlements, *state.history),
            }
            for domain, values in refs.items():
                previous = self._revision_refs.get(domain, ())
                if domain not in self._revisions or len(previous) != len(values) or any(
                        a is not b for a, b in zip(previous, values, strict=True)):
                    self._revisions[domain] = self._revisions.get(domain, 0) + 1
            self._revision_refs = refs
            self._revision_state = state
        return dict(self._revisions)

    @property
    def checksum(self) -> str:
        """State digest, recomputed only when the state object changes."""
        if self._digest is None or self._digest[0] is not self.state:
            self._digest = (self.state, state_checksum(self.state))
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
        self._archives: dict[str, HistoryArchive] = {}
        self.unloadable: dict[str, str] = {}
        for scenario_id in self.store.ids():
            self._load(scenario_id)
        if not self.sessions:
            # Unloadable saves stay on disk untouched; a fresh baseline is created beside them so the app is usable.
            baseline = self.config["baseline"]
            baseline_id = baseline["id"] if baseline["id"] not in self.unloadable else None
            self.create(CreateScenario(name=baseline["name"], description=baseline.get("description", ""),
                                       scope=Scope(**baseline["scope"]), seed=baseline["seed"]), scenario_id=baseline_id)

    def _load(self, scenario_id: str) -> None:
        try:
            raw_meta, raw_state, raw_events, file_format = self.store.load(scenario_id)
            foreign = raw_state.get("world", {}).get("sourceFingerprint") != self.fingerprint
            rules = complete(raw_meta.get("rules") or {}, self.model.config.rules)
            state, stored_schema = migrate_state(raw_state, self.model, rules)
        except (IncompatibleState, KeyError, ValueError) as exc:
            log.error("scenario cannot be loaded; files left untouched", exc, scenarioId=scenario_id)
            self.unloadable[scenario_id] = str(exc)
            return
        if not foreign and stored_schema < STATE_SCHEMA_VERSION:
            state = self._restore_news(state, rules)
        session = Session(ScenarioMeta(**raw_meta), state, [Event(**e) for e in raw_events])
        if not foreign and stored_schema < STATE_SCHEMA_VERSION:
            session.meta = session.meta.model_copy(update={"journal": None})
            if session.meta.rules is not None:
                self._freeze(session, rules)
        if session.meta.rules is None and not foreign:
            self._freeze(session)
            self._event(session, "migrated", f"Froze the current rules for this scenario ({session.meta.rulesFingerprint[:19]}…)")
            self._persist(session)
        if foreign:
            session.read_only = ("Saved against a different source map "
                                 f"({state.world.sourceFingerprint[:15]}…); inspect only until migrated.")
            log.warn("scenario from another source map loaded read-only", scenarioId=scenario_id)
        elif stored_schema < STATE_SCHEMA_VERSION or file_format < 2:
            self._event(session, "migrated", f"Upgraded saved state from schema v{stored_schema} to v{STATE_SCHEMA_VERSION}",
                        fromSchema=stored_schema)
            self._persist(session)
        self.archive(scenario_id).cut(state.historySeq)    # heals a crash between appending events and saving the bundle
        if not session.read_only and self._backstory(session):
            session.meta = session.meta.model_copy(update={"journal": None})    # the past was added outside the journal
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
        if s.busy or s.stopping:
            raise ApiError(409, "busy", "A step is still being computed for this scenario", {"id": scenario_id})
        return s

    def status(self, s: Session) -> dict[str, Any]:
        return {
            **s.meta.model_dump(exclude={"rules", "journal"}),
            "replayable": s.meta.journal is not None,
            # False when the YAML has changed since the scenario froze its rules; it keeps running under its own.
            "rulesCurrent": s.meta.rulesFingerprint == fingerprint(freeze(self.model.config.rules)),
            "schemaVersion": s.state.schemaVersion,
            "settlementIds": [x.settlementId for x in s.state.settlements],
            "date": s.state.date.model_dump(),
            "running": s.running,
            "speed": s.speed if s.running else 0,
            "population": sum(x.population for x in s.state.settlements) + s.state.travel.population,
            "populationInTransit": s.state.travel.population,
            "checksum": s.checksum,
            "revisions": s.domain_revisions(),
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
        # The stored state is checked before migrating, so a snapshot from an older schema stays usable. PR2 snapshots carry
        # the 8-hex FNV of their v1 state; newer ones the digest of the state as saved.
        intact = (checksum(raw_state) if len(meta.checksum) == 8 else state_digest(raw_state)) == meta.checksum
        if not intact:
            raise ApiError(500, "corrupt_snapshot", f"Snapshot {snapshot_id} does not match its checksum")
        rules = self.rules(self.session(scenario_id))
        try:
            state, stored_schema = migrate_state(raw_state, self.model, rules)
        except IncompatibleState as exc:
            raise ApiError(409, "incompatible_snapshot", str(exc), {"id": snapshot_id}) from exc
        if state.world.sourceFingerprint != self.fingerprint or state.scenarioId != scenario_id:
            raise ApiError(409, "foreign_snapshot", f"Snapshot {snapshot_id} belongs to another scenario or source map",
                           {"id": snapshot_id, "scenarioId": state.scenarioId})
        if stored_schema < STATE_SCHEMA_VERSION:
            state = self._restore_news(state, rules)
            meta = meta.model_copy(update={"journalAt": None})
        return meta, state

    def _restore_news(self, state: ScenarioState, rules: dict[str, Any]) -> ScenarioState:
        if not state.historySeq:
            return state
        archive = self.archive(state.scenarioId)
        day = state.date.day
        sim = rules["simulation"]
        max_age = sim["travel"]["newsMaxAgeDays"]
        knowledge = sim["people"]["knowledge"]
        minimum = knowledge.get("rumourMinImportance", knowledge["minImportance"])
        ids = report_ids(state.travel, state.trade.caravans)
        indexed = [e for e in archive.many(sorted(ids)) if e.seq < state.historySeq and e.day <= day]
        published = {e.id: e.day for e in indexed}
        witnesses = {e.id: [p.personId for p in e.participants] for e in indexed if e.participants}
        travel = state.travel.model_copy(update={"newsPublishedDays": published, "newsWitnesses": witnesses})
        recent = archive.query(before=state.historySeq, from_day=day - max_age, to_day=day, min_importance=minimum, limit=None)
        travel = remember(travel, recent, minimum, sim["travel"]["newsPerSettlement"])
        return state.model_copy(update={"travel": expire(travel, day, max_age)})

    # ---- mutations -----------------------------------------------------
    def _event(self, s: Session, kind: str, message: str, at_day: int | None = None, **data: Any) -> None:
        """Logs an event, dated `at_day` (a month close inside a longer step) or the scenario's current date."""
        date = s.state.date if at_day is None else date_for(at_day, s.state.startYear, self.rules(s)["simulation"]["calendar"])
        s.meta = s.meta.model_copy(update={"eventSeq": s.meta.eventSeq + 1})
        s.events.append(Event(seq=s.meta.eventSeq, day=date.day, date=date.label, kind=kind, message=message, data=data))
        del s.events[: max(0, len(s.events) - self.limits["maxEvents"])]
        s.dirty = True

    def _save(self, meta: ScenarioMeta, state: ScenarioState, events: tuple[Event, ...]) -> None:
        self.store.save(meta.id, meta.model_dump(), state.model_dump(), [e.model_dump() for e in events])

    def _persist(self, s: Session) -> None:
        self._save(s.meta, s.state, tuple(s.events))
        s.dirty, s.saved_at = False, time.monotonic()

    async def _persist_async(self, s: Session) -> None:
        # The session remains write-locked until its immutable snapshot is durable.
        s.busy = True
        try:
            task = asyncio.create_task(asyncio.to_thread(self._save, s.meta, s.state, tuple(s.events)))
            try:
                await asyncio.shield(task)
            except asyncio.CancelledError:
                await task
                s.dirty, s.saved_at = False, time.monotonic()
                raise
            s.dirty, s.saved_at = False, time.monotonic()
        finally:
            s.busy = False

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
            if req.peoples:
                raise ApiError(400, "invalid_assignment", "Branches inherit their snapshot’s identity assignments")
            if not req.fromSnapshotId:
                raise ApiError(400, "invalid_request", "Branching needs fromSnapshotId", {"parameter": "fromSnapshotId"})
            parent = self.writable(req.fromScenarioId)
            snapshot, snap_state = self._snapshot_state(parent.meta.id, req.fromSnapshotId)
            state = snap_state.model_copy(update={"scenarioId": scenario_id})
            branch = self.archive(scenario_id)
            branch.cut(0)
            self.archive(parent.meta.id).copy_to(branch, state.historySeq)
            replayable = parent.meta.journal is not None and snapshot.journalAt is not None
            meta = ScenarioMeta(id=scenario_id, name=req.name, description=req.description, scope=parent.meta.scope, seed=state.seed,
                                parent=ParentRef(scenarioId=parent.meta.id, snapshotId=snapshot.id), createdAt=_now(),
                                rules=parent.meta.rules, rulesFingerprint=parent.meta.rulesFingerprint,
                                journal=parent.meta.journal[:snapshot.journalAt] if replayable else None,
                                journalRoot=(parent.meta.journalRoot or parent.meta.id) if replayable else None)
            session = Session(meta, state, [])
            self._event(session, "branched", f"Branched from {parent.meta.name} at snapshot “{snapshot.label}” ({snapshot.date.label})")
        else:
            scope = req.scope or Scope(type="pilot")
            settlement_ids = resolve_scope(self.model, scope, self.limits["maxScopeSettlements"])
            seed = req.seed if req.seed is not None else self.config["baseline"]["seed"]
            rules = assigned_rules(self.model.config.rules, req.peoples, settlement_ids)
            state = baseline_state(self.model, scenario_id=scenario_id, settlement_ids=settlement_ids, seed=seed,
                                   start_year=self.start_year, rules=rules)
            meta = ScenarioMeta(id=scenario_id, name=req.name, description=req.description, scope=scope, seed=seed, createdAt=_now(),
                                journal=[], journalRoot=scenario_id)
            session = Session(meta, state, [])
            self._freeze(session, rules)
            self.archive(scenario_id).cut(0)
            self._backstory(session)
            businesses = sum(len(s.society.businesses) for s in state.settlements)
            self._event(session, "created",
                        f"Created with {len(settlement_ids)} settlements and {businesses} businesses from the imported world")
        self.sessions[scenario_id] = session
        self._persist(session)
        return session

    def labeller(self, state: ScenarioState) -> Callable[[int], str]:
        """Day -> date label under the scenario's frozen calendar; a reconstructed past before the start is only a year."""
        session = self.sessions.get(state.scenarioId)
        calendar = self.rules(session)["simulation"]["calendar"] if session else self.config["calendar"]
        year = calendar["daysPerMonth"] * calendar["monthsPerYear"]

        def label(day: int) -> str:
            return date_for(day, state.startYear, calendar).label if day >= 0 else str(state.startYear + day // year)

        return label

    def record_player_event(self, scenario_id: str, incident: dict[str, Any]) -> None:
        """Records something the player did with a person (a first meeting) as canonical history, and saves."""
        s = self.writable(scenario_id)
        s.state, events = player_event(s.state, incident, self.rules(s))
        self.archive(scenario_id).append(events)
        self._journal(s, {"op": "player", "incident": incident})
        self._event(s, incident["kind"], incident["message"], eventId=events[0].id, personId=incident.get("person"))
        self._persist(s)

    def intervene(self, scenario_id: str, spec: Intervention) -> list[HistoryEvent]:
        """Applies a designer's event at the current day (paused scenarios only) and saves; returns the events recorded."""
        s = self.writable(scenario_id)
        if s.running:
            raise ApiError(409, "running", "Pause the scenario before intervening")
        try:
            s.state, events = intervene(s.state, spec, self.rules(s))
        except InvalidIntervention as exc:
            raise ApiError(400, "invalid_intervention", str(exc)) from exc
        self.archive(scenario_id).append(events)
        self._journal(s, {"op": "intervene", "spec": spec.model_dump()})
        self._event(s, "intervention", events[0].summary, eventId=events[0].id, settlementId=events[0].settlementId,
                    businessId=events[0].businessId, routeId=events[0].routeId)
        self._persist(s)
        return events

    def _journal(self, s: Session, op: dict[str, Any]) -> None:
        journal = s.meta.journal
        if journal is None:
            return
        if op["op"] == "advance" and journal and journal[-1]["op"] == "advance":
            journal = [*journal[:-1], {"op": "advance", "days": journal[-1]["days"] + op["days"]}]   # steps chunk freely
        else:
            journal = [*journal, op]
        s.meta = s.meta.model_copy(update={"journal": journal})

    async def replay(self, scenario_id: str) -> dict[str, Any]:
        """Rebuilds the scenario from its baseline and journal off the event loop and compares it with the live state."""
        s = self.session(scenario_id)
        if s.meta.journal is None:
            return {"replayable": False, "reason": "This scenario has no complete journal: it was made before journals, "
                    "migrated, or branched from such a scenario."}
        meta, state, rules = s.meta, s.state, self.rules(s)       # captured together, so a running scenario compares consistently
        archived = self.archive(scenario_id).query(before=state.historySeq, limit=None)
        started = time.perf_counter()
        replayed, events = await asyncio.to_thread(replay, self.model, meta, state.startYear, rules, meta.journal)
        seconds = time.perf_counter() - started
        expected, actual = state_checksum(state), state_checksum(replayed)
        live, again = event_digest(sorted(archived, key=lambda e: e.seq)), event_digest(sorted(events, key=lambda e: e.seq))
        return {"replayable": True, "matches": expected == actual and live == again, "seconds": round(seconds, 2),
                "commands": len(meta.journal), "date": state.date.label,
                "state": {"live": expected, "replayed": actual, "matches": expected == actual},
                "history": {"live": live, "replayed": again, "liveCount": len(archived), "replayedCount": len(events),
                            "matches": live == again}}

    def archive(self, scenario_id: str) -> HistoryArchive:
        if scenario_id not in self._archives:
            self._archives[scenario_id] = HistoryArchive(self.store.history_path(scenario_id))
        return self._archives[scenario_id]

    def _backstory(self, s: Session) -> int:
        """Reconstructs the past of anyone on record without one (everyone, at creation); returns how many events it added."""
        s.state, events = with_past(s.state, self.rules(s))
        self.archive(s.meta.id).append(events)
        return len(events)

    def _freeze(self, s: Session, rules: dict | None = None) -> None:
        frozen = freeze(rules or self.model.config.rules)
        s.meta = s.meta.model_copy(update={"rules": frozen, "rulesFingerprint": fingerprint(frozen)})

    def rules(self, s: Session) -> dict[str, Any]:
        """The scenario's frozen rules; only a foreign, read-only scenario can lack them, and it never advances."""
        return complete(s.meta.rules or freeze(self.model.config.rules), self.model.config.rules)

    def _advance(self, s: Session, days: int) -> None:
        started = time.perf_counter()
        timings = PhaseTimings()
        state, months = advance_frames(s.state, days, self.rules(s), timings=timings)
        self._apply(s, state, months, days, time.perf_counter() - started, timings)

    async def _advance_off_loop(self, s: Session, days: int) -> None:
        """Computes the step in a worker thread so the API keeps answering; the result is applied back on the loop."""
        s.busy = True
        started = time.perf_counter()
        timings = PhaseTimings()
        try:
            state, months = await asyncio.to_thread(advance_frames, s.state, days, self.rules(s), timings=timings)
            seconds = time.perf_counter() - started
            archive = self.archive(s.meta.id)
            events = [e for month in months for e in month["events"]]
            archive.visible_before = s.state.historySeq
            try:
                archive_started = time.perf_counter()
                task = asyncio.create_task(asyncio.to_thread(archive.append, events))
                try:
                    await asyncio.shield(task)
                except asyncio.CancelledError:
                    await task
                    self._apply(s, state, months, days, seconds, timings,
                                archive_ms=(time.perf_counter() - archive_started) * 1000)
                    raise
                self._apply(s, state, months, days, seconds, timings,
                            archive_ms=(time.perf_counter() - archive_started) * 1000)
            finally:
                archive.visible_before = None
        finally:
            s.busy = False

    def _apply(self, s: Session, state: ScenarioState, months: list[dict[str, Any]], days: int, seconds: float,
               timings: PhaseTimings, *, archive_ms: float | None = None) -> None:
        events = [e for m in months for e in m["events"]]
        if archive_ms is None:
            archive_started = time.perf_counter()
            self.archive(s.meta.id).append(events)
            archive_ms = (time.perf_counter() - archive_started) * 1000
        started = time.perf_counter()
        s.state = state
        self._journal(s, {"op": "advance", "days": days})
        for m in months:
            for incident in m["incidents"]:     # what happened during the month, then its close
                people = incident.get("participants") or []
                self._event(s, incident["kind"], incident["message"], at_day=m["day"], eventId=incident["eventId"],
                            personId=people[0]["personId"] if people else incident.get("person"), trader=incident.get("trader"),
                            **{k: incident.get(k) for k in ("businessId", "routeId", "caravanId", "settlementId")},
                            value=incident.get("value"))
            if not m.get("monthClose", True):
                continue
            self._event(s, "month", f"{m['label']} closed: {m['births']} births, {m['deaths']} deaths, population {m['population']:,}, "
                        f"{m['unemployed']:,} without work, {m['caravans']} caravans, {m['shortages']} shortages",
                        at_day=m["day"], births=m["births"], deaths=m["deaths"], population=m["population"], unemployed=m["unemployed"],
                        caravans=m["caravans"], shortages=m["shortages"], foodSecurity=m["foodSecurity"], bandits=m["bandits"])
        s.dirty = True
        s.perf.append({"day": state.date.day, "days": days, "months": sum(m.get("monthClose", True) for m in months),
                       "ms": round(seconds * 1000, 1), "events": len(events), "people": len(state.cast.people),
                       "phases": {**timings.report(), "archive": round(archive_ms, 2),
                                  "publication": round((time.perf_counter() - started) * 1000, 2)}})

    def _steppable(self, scenario_id: str, days: int) -> Session:
        s = self.writable(scenario_id)
        if s.running:
            raise ApiError(409, "running", "Pause the scenario before stepping it")
        if not 1 <= days <= self.limits["maxStepDays"]:
            raise ApiError(400, "invalid_parameter", f"days must be 1-{self.limits['maxStepDays']}", {"parameter": "days"})
        return s

    def _stepped(self, s: Session, days: int, start: str) -> Session:
        self._event(s, "stepped", f"Stepped {days} day{'s' if days != 1 else ''} from {start}", days=days)
        self._persist(s)
        return s

    def step(self, scenario_id: str, days: int) -> Session:
        s = self._steppable(scenario_id, days)
        start = s.state.date.label
        self._advance(s, days)
        return self._stepped(s, days, start)

    async def step_async(self, scenario_id: str, days: int) -> Session:
        s = self._steppable(scenario_id, days)
        start = s.state.date.label
        await self._advance_off_loop(s, days)
        self._event(s, "stepped", f"Stepped {days} day{'s' if days != 1 else ''} from {start}", days=days)
        await self._persist_async(s)
        return s

    def run(self, scenario_id: str, speed: float) -> Session:
        s = self.writable(scenario_id)
        if speed not in self.config["speeds"]:
            raise ApiError(400, "invalid_parameter", f"speed must be one of {self.config['speeds']}", {"parameter": "speed"})
        s.speed, s.error = speed, None
        if not s.running:
            s.stopping = False
            s.carry = 0.0
            s.task = asyncio.get_running_loop().create_task(self._run_loop(s))
            self._event(s, "run", f"Running at {speed:g} days per second", speed=speed)
        return s

    async def _run_loop(self, s: Session) -> None:
        tick = self.config["runner"]["tickSeconds"]
        try:
            while not s.stopping:
                await asyncio.sleep(tick)
                if s.stopping:
                    break
                s.carry += s.speed * tick
                days, s.carry = int(s.carry), s.carry - int(s.carry)
                if days:
                    await self._advance_off_loop(s, days)
                if s.dirty and time.monotonic() - s.saved_at >= 1.0:
                    await self._persist_async(s)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - a failing run stops with its reason recorded, never silently
            log.error("scenario run failed", exc, scenarioId=s.meta.id)
            s.error = str(exc)
            self._event(s, "error", f"Run stopped: {exc}")
            await self._persist_async(s)

    async def pause(self, scenario_id: str) -> Session:
        s = self.session(scenario_id)
        if s.stopping or (s.busy and not s.running):
            raise ApiError(409, "busy", "A scenario operation is still completing")
        s.stopping = True
        try:
            if s.running:
                await s.task
                self._event(s, "paused", f"Paused at {s.state.date.label}")
            s.task = None
            if not s.read_only:
                await self._persist_async(s)
            return s
        finally:
            s.stopping = False

    def snapshot(self, scenario_id: str, label: str) -> SnapshotMeta:
        s = self.writable(scenario_id)
        if len(self.store.snapshots(scenario_id)) >= self.limits["maxSnapshots"]:
            raise ApiError(409, "limit_reached", f"At most {self.limits['maxSnapshots']} snapshots per scenario")
        s.meta = s.meta.model_copy(update={"snapshotSeq": s.meta.snapshotSeq + 1})
        self._journal(s, {"op": "mark"})     # later steps start a new command, so the snapshot's prefix stays exact
        meta = SnapshotMeta(id=f"snap-{s.meta.snapshotSeq:03d}", label=label.strip() or s.state.date.label, date=s.state.date,
                            checksum=s.checksum, createdAt=_now(),
                            journalAt=len(s.meta.journal) if s.meta.journal is not None else None)
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
        journal = s.meta.journal[:meta.journalAt] if s.meta.journal is not None and meta.journalAt is not None else None
        s.meta = s.meta.model_copy(update={"journal": journal})
        self.archive(scenario_id).cut(state.historySeq)
        self._event(s, "restored", f"Restored snapshot “{meta.label}” ({meta.date.label})", snapshotId=meta.id)
        self._persist(s)
        return s

    async def shutdown(self) -> None:
        for scenario_id, s in self.sessions.items():
            if s.running:
                await self.pause(scenario_id)
            elif s.dirty and not s.read_only:
                await self._persist_async(s)
