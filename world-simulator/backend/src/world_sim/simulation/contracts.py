"""Canonical scenario state contracts (schema v1). Everything persisted or exported goes through these."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

STATE_SCHEMA_VERSION = 1


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WorldRef(Contract):
    mapId: str
    sourceFingerprint: str


class Scope(Contract):
    type: Literal["pilot", "state", "province", "settlements"]
    id: str | None = None                       # state or province id for those scope types
    settlementIds: list[str] | None = None      # explicit list for type "settlements"


class Cohorts(Contract):
    children: int = Field(ge=0)
    adults: int = Field(ge=0)
    elders: int = Field(ge=0)

    @property
    def total(self) -> int:
        return self.children + self.adults + self.elders


class SettlementState(Contract):
    settlementId: str
    sourceId: int
    name: str
    population: int = Field(ge=0)
    cohorts: Cohorts
    births: int = 0      # cumulative since the scenario began
    deaths: int = 0


class CalendarDate(Contract):
    day: int = Field(ge=0)     # days elapsed since the scenario's start
    year: int
    month: int = Field(ge=1)
    dayOfMonth: int = Field(ge=1)
    label: str


class HistoryPoint(Contract):
    day: int
    population: dict[str, int]      # settlementId -> inhabitants at month close


class ScenarioState(Contract):
    schemaVersion: int = STATE_SCHEMA_VERSION
    scenarioId: str
    world: WorldRef
    seed: int
    startYear: int
    date: CalendarDate
    settlements: list[SettlementState]
    history: list[HistoryPoint]


class ParentRef(Contract):
    scenarioId: str
    snapshotId: str


class ScenarioMeta(Contract):
    id: str
    name: str
    description: str = ""
    scope: Scope
    seed: int
    parent: ParentRef | None = None
    createdAt: str
    snapshotSeq: int = 0
    eventSeq: int = 0


class SnapshotMeta(Contract):
    id: str
    label: str
    date: CalendarDate
    checksum: str
    createdAt: str


class Event(Contract):
    seq: int
    day: int
    date: str
    kind: Literal["created", "branched", "stepped", "month", "snapshot", "restored", "run", "paused", "error"]
    message: str
    data: dict[str, int | float | str | None] = {}


# Request bodies.
class CreateScenario(Contract):
    name: str = Field(min_length=1, max_length=80)
    description: str = Field("", max_length=500)
    scope: Scope | None = None
    seed: int | None = None
    fromScenarioId: str | None = None
    fromSnapshotId: str | None = None


class StepRequest(Contract):
    days: int | None = Field(None, ge=1)
    unit: Literal["day", "week", "month", "year"] | None = None


class RunRequest(Contract):
    speed: float = Field(gt=0)


class SnapshotRequest(Contract):
    label: str = Field("", max_length=80)


class RestoreRequest(Contract):
    snapshotId: str
