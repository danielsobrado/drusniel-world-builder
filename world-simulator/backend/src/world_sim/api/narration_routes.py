"""Local LLM status, biography generation jobs and the Dialogue Lab."""

from collections.abc import Callable
from typing import Literal

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from ..narration.prompts import KINDS
from ..narration.providers import ProviderError
from ..narration.service import Narrator
from ..simulation.manager import ScenarioManager
from .errors import ApiError

Kind = Literal["short", "detailed", "style", "self"]


class Body(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BiographyRequest(Body):
    kinds: list[Kind] = Field(default_factory=lambda: list(KINDS))


class BatchRequest(Body):
    kinds: list[Kind] = Field(default_factory=lambda: ["short"])
    settlementId: str | None = None
    onlyMissing: bool = True


class ConversationRequest(Body):
    title: str = Field("", max_length=80)


class MessageRequest(Body):
    text: str = Field(min_length=1, max_length=2000)


def narration_router(manager: ScenarioManager, narrator: Narrator, reply: Callable[..., JSONResponse]) -> APIRouter:
    router = APIRouter(prefix="/api")

    def person(scenario_id: str, person_id: str) -> None:
        if not any(p.id == person_id for p in manager.session(scenario_id).state.cast.people):
            raise ApiError(404, "not_found", f"No person {person_id}", {"id": person_id})

    @router.get("/llm")
    async def status() -> JSONResponse:
        return reply(narrator.status())

    @router.get("/llm/jobs")
    async def jobs(scenario: str | None = None) -> JSONResponse:
        return reply(narrator.job_list(scenario))

    @router.get("/scenarios/{scenario_id}/people/{person_id}/biographies")
    async def biographies(scenario_id: str, person_id: str) -> JSONResponse:
        person(scenario_id, person_id)
        return reply(narrator.biographies(scenario_id, person_id))

    @router.post("/scenarios/{scenario_id}/people/{person_id}/biographies", status_code=202)
    async def write(scenario_id: str, person_id: str, body: BiographyRequest) -> JSONResponse:
        person(scenario_id, person_id)
        return reply([vars(j) for j in narrator.enqueue(scenario_id, [person_id], list(body.kinds))], status=202)

    @router.post("/scenarios/{scenario_id}/biographies", status_code=202)
    async def batch(scenario_id: str, body: BatchRequest) -> JSONResponse:
        """Queues biographies for the living people of a scenario (or one settlement), skipping those already written."""
        state = manager.session(scenario_id).state
        done = narrator.store(scenario_id).written() if body.onlyMissing else set()
        people = [p.id for p in state.cast.people if p.alive and body.settlementId in (None, p.settlementId)
                  and any((p.id, k) not in done for k in body.kinds)]
        return reply([vars(j) for j in narrator.enqueue(scenario_id, people, list(body.kinds))], status=202)

    @router.get("/scenarios/{scenario_id}/people/{person_id}/conversations")
    async def conversations(scenario_id: str, person_id: str) -> JSONResponse:
        person(scenario_id, person_id)
        return reply(narrator.store(scenario_id).conversations(person_id))

    @router.post("/scenarios/{scenario_id}/people/{person_id}/conversations", status_code=201)
    async def start(scenario_id: str, person_id: str, body: ConversationRequest) -> JSONResponse:
        person(scenario_id, person_id)
        day = manager.session(scenario_id).state.date.day
        return reply(narrator.store(scenario_id).start_conversation(person_id, body.title or "Conversation", day), status=201)

    @router.get("/scenarios/{scenario_id}/conversations/{conversation_id}")
    async def messages(scenario_id: str, conversation_id: int) -> JSONResponse:
        store = narrator.store(scenario_id)
        convo = store.conversation(conversation_id)
        if convo is None:
            raise ApiError(404, "not_found", f"No conversation {conversation_id}", {"id": conversation_id})
        return reply({**convo, "messages": store.messages(conversation_id)})

    @router.post("/scenarios/{scenario_id}/conversations/{conversation_id}/messages", status_code=201)
    async def say(scenario_id: str, conversation_id: int, body: MessageRequest) -> JSONResponse:
        manager.writable(scenario_id)
        try:
            pair = await narrator.say(scenario_id, conversation_id, body.text)
        except LookupError as exc:
            raise ApiError(404, "not_found", str(exc), {"id": conversation_id}) from exc
        except ProviderError as exc:
            raise ApiError(503, "llm_unavailable", str(exc)) from exc
        return reply(pair, status=201)

    return router
