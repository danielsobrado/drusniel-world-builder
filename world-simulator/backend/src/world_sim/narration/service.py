"""
Narration and dialogue for the workbench. Biographies are background jobs (local models
are slow); a dialogue turn is answered directly. Both build the person's biography context
on the event loop, call the provider in a worker thread, fact-check the words and store
them. Nothing written here changes the simulation, except that a first conversation with
someone is recorded in history as a player event.
"""

import asyncio
import hashlib
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from typing import Any

from ..canonical import compact_json
from ..simulation.manager import ScenarioManager
from ..simulation.people.context import ContextBuilder
from .factcheck import check
from .prompts import KINDS, biography_messages, dialogue_messages
from .providers import Provider, ProviderError, resolve
from .store import NarrationStore

STATUS_SECONDS = 15


@dataclass
class Job:
    id: int
    scenarioId: str
    personId: str
    kind: str
    status: str = "queued"          # queued, running, done, failed
    error: str | None = None
    created: str = field(default_factory=lambda: datetime.now(UTC).isoformat(timespec="seconds"))


def facts_hash(context: dict[str, Any]) -> str:
    """The life facts a text was written from. Age, mood, concerns and the town's month-to-month circumstances move all the
    time and do not make prose stale; a new milestone, relationship, home or post does."""
    work = context["work"]
    stable = {
        "identity": {k: v for k, v in context["identity"].items() if k != "age"},
        "household": context["household"],
        "relationships": [(r["kind"], r["with"], r["alive"], r["until"]) for r in context["relationships"]],
        "work": (work["role"], work["profession"], work["workplace"]),
        "milestones": [m["id"] for m in context["milestones"]],
    }
    return hashlib.sha256(compact_json(stable).encode()).hexdigest()[:16]


class Narrator:
    def __init__(self, manager: ScenarioManager, cfg: dict[str, Any], provider: Provider | None = None):
        self.manager, self.cfg = manager, cfg
        self.fixed = provider                       # tests pass a provider; otherwise it is resolved from the config
        self._status: tuple[float, Provider, dict[str, Any]] | None = None
        self.jobs: list[Job] = []
        self.queue: asyncio.Queue[Job] | None = None
        self.workers: list[asyncio.Task] = []

    # ---- provider ----------------------------------------------------------
    def provider(self) -> tuple[Provider, dict[str, Any]]:
        if self.fixed is not None:
            return self.fixed, {"mode": "llm" if self.fixed.name != "draft" else "draft", "provider": self.fixed.name,
                                "model": self.fixed.model, "hint": None, "reachable": True, "models": [self.fixed.model]}
        if self._status is None or time.monotonic() - self._status[0] > STATUS_SECONDS:
            self._status = (time.monotonic(), *resolve(self.cfg))
        return self._status[1], self._status[2]

    def status(self) -> dict[str, Any]:
        _, status = self.provider()
        counts = {s: sum(1 for j in self.jobs if j.status == s) for s in ("queued", "running", "done", "failed")}
        return {**status, "jobs": counts}

    # ---- context -----------------------------------------------------------
    def store(self, scenario_id: str) -> NarrationStore:
        return NarrationStore(self.manager.store.history_path(scenario_id).with_name("narration.sqlite"))

    def context(self, scenario_id: str, person_id: str) -> dict[str, Any]:
        session = self.manager.session(scenario_id)
        builder = ContextBuilder(session.state, self.manager.archive(scenario_id), self.manager.rules(session),
                                 self.manager.model.settlements_by_id, self.manager.labeller(session.state))
        return builder.build(person_id)

    # ---- biographies -------------------------------------------------------
    def biographies(self, scenario_id: str, person_id: str) -> list[dict[str, Any]]:
        current = facts_hash(self.context(scenario_id, person_id))
        return [{**b, "stale": b["facts_hash"] != current} for b in self.store(scenario_id).biographies(person_id)]

    def enqueue(self, scenario_id: str, people: list[str], kinds: list[str]) -> list[Job]:
        bad = [k for k in kinds if k not in KINDS]
        if bad:
            raise ValueError(f"unknown biography kinds: {', '.join(bad)}")
        waiting = sum(1 for j in self.jobs if j.status in ("queued", "running"))
        room = max(0, self.cfg["jobs"]["maxQueued"] - waiting)
        new = [Job(len(self.jobs) + i + 1, scenario_id, p, k) for i, (p, k) in enumerate((p, k) for p in people for k in kinds)][:room]
        self.jobs += new
        del self.jobs[: max(0, len(self.jobs) - 1000)]
        self._start()
        for job in new:
            self.queue.put_nowait(job)
        return new

    def _start(self) -> None:
        if self.queue is None:
            self.queue = asyncio.Queue()
        self.workers = [w for w in self.workers if not w.done()]
        while len(self.workers) < self.cfg["jobs"]["concurrency"]:
            self.workers.append(asyncio.get_running_loop().create_task(self._work()))

    async def _work(self) -> None:
        while True:
            job = await self.queue.get()
            job.status = "running"
            try:
                await self.write(job.scenarioId, job.personId, job.kind)
                job.status = "done"
            except Exception as exc:  # noqa: BLE001 - a failed job records its reason and the queue moves on
                job.status, job.error = "failed", str(exc)
            finally:
                self.queue.task_done()

    async def write(self, scenario_id: str, person_id: str, kind: str) -> dict[str, Any]:
        context = self.context(scenario_id, person_id)
        provider, _ = self.provider()
        messages = biography_messages(context, kind)
        text = await asyncio.to_thread(provider.complete, messages, self.cfg["maxTokens"][kind], kind, context)
        warnings = check(text, context)
        day = self.manager.session(scenario_id).state.date.day
        self.store(scenario_id).save_biography(person_id, kind, text, provider.name, provider.model, facts_hash(context), day, warnings)
        return {"text": text, "warnings": warnings}

    async def drain(self) -> None:
        """Waits until every queued job has run (for tests and shutdown)."""
        if self.queue is not None:
            await self.queue.join()

    def job_list(self, scenario_id: str | None) -> list[dict[str, Any]]:
        return [asdict(j) for j in reversed(self.jobs) if scenario_id in (None, j.scenarioId)][:200]

    # ---- dialogue ----------------------------------------------------------
    async def say(self, scenario_id: str, conversation_id: int, text: str) -> list[dict[str, Any]]:
        store = self.store(scenario_id)
        convo = store.conversation(conversation_id)
        if convo is None:
            raise LookupError(f"No conversation {conversation_id}")
        d = self.cfg["dialogue"]
        said = text.strip()[: d["maxMessageChars"]]
        person = convo["person"]
        first_meeting = not store.memory(person, 1)
        context = self.context(scenario_id, person)
        history = [{"role": "assistant" if m["role"] == "npc" else "user", "content": m["text"]}
                   for m in store.messages(conversation_id)][-d["historyMessages"]:]
        messages = dialogue_messages(context, history, store.memory(person, d["memoryItems"]), said)
        provider, _ = self.provider()
        try:
            reply = await asyncio.to_thread(provider.complete, messages, self.cfg["maxTokens"]["reply"], "reply", context)
        except ProviderError:
            raise
        day = self.manager.session(scenario_id).state.date.day
        mine = store.add_message(conversation_id, "user", said, day)
        theirs = store.add_message(conversation_id, "npc", reply, day, provider.name, provider.model, check(reply, context))
        if first_meeting:
            self.manager.record_player_event(scenario_id, {
                "kind": "met-player", "person": person, "role": "met", "message": f"{context['identity']['name']} met a traveller",
                "settlementId": next(p.settlementId for p in self.manager.session(scenario_id).state.cast.people if p.id == person),
                "facts": {"conversation": conversation_id}})
        return [mine, theirs]
