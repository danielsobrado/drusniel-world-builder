"""Canonical scenario state contracts (schema v6). Everything persisted or exported goes through these."""

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from .economy.contracts import SettlementEconomy, Trade
from .people.contracts import Cast

STATE_SCHEMA_VERSION = 6  # v2 society, v3 economy, v4 roads, v5 people, v6 canonical history; older states migrate on load


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


class HouseholdGroup(Contract):
    """Households of one composition; `adults` etc. are totals over the group."""
    kind: str
    label: str
    households: int = Field(ge=0)
    adults: int = Field(ge=0)
    children: int = Field(ge=0)
    elders: int = Field(ge=0)


class HousingStock(Contract):
    type: str
    label: str
    buildings: int = Field(ge=0)
    capacity: int = Field(ge=0)      # households
    occupied: int = Field(ge=0)
    vacant: int = Field(ge=0)


class Business(Contract):
    id: str
    settlementId: str
    kind: str
    name: str
    sector: str
    profession: str
    good: str | None = None
    staff: int = Field(ge=1)         # posts
    wage: int = Field(ge=0)          # copper per worker-day
    filled: int = Field(ge=0)
    evidence: str | None = None      # why it exists, when sourced from Azgaar
    ownerId: str | None = None       # the trader who funded it, for businesses opened during a run
    openedDay: int | None = None
    idleMonths: int = 0              # months in a row with no worker; opened businesses close after a while


class Employment(Contract):
    labourSupply: int
    employed: int
    unemployed: int
    vacancies: int
    wageBillPerMonth: int


class SectorEmployment(Contract):
    sector: str
    businesses: int
    demand: int
    filled: int


class Need(Contract):
    id: str
    label: str
    value: float
    status: Literal["ok", "strained", "critical"]
    explanation: str


class Society(Contract):
    households: list[HouseholdGroup]
    housing: list[HousingStock]
    overcrowdedHouseholds: int
    businesses: list[Business]
    employment: Employment
    sectors: list[SectorEmployment]
    needs: list[Need]


class SettlementState(Contract):
    settlementId: str
    sourceId: int
    name: str
    population: int = Field(ge=0)
    cohorts: Cohorts
    births: int = 0      # cumulative since the scenario began
    deaths: int = 0
    society: Society
    economy: SettlementEconomy


class CalendarDate(Contract):
    day: int = Field(ge=0)     # days elapsed since the scenario's start
    year: int
    month: int = Field(ge=1)
    dayOfMonth: int = Field(ge=1)
    label: str


class HistoryPoint(Contract):
    day: int
    population: dict[str, int]      # settlementId -> inhabitants at month close
    labour: dict[str, int] = {}     # settlementId -> labour force (v4 runs onwards)
    unemployed: dict[str, int] = {}
    bandits: int = 0                # on every road in scope


class ScenarioState(Contract):
    schemaVersion: int = STATE_SCHEMA_VERSION
    scenarioId: str
    world: WorldRef
    seed: int
    startYear: int
    date: CalendarDate
    settlements: list[SettlementState]
    history: list[HistoryPoint]
    trade: Trade
    cast: Cast
    historySeq: int = 0                      # next canonical event number; the archive is cut here on restore


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
    rules: dict[str, Any] | None = None      # the frozen ruleset it runs under (simulation/rules.py)
    rulesFingerprint: str | None = None


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
    kind: str                        # scenario actions (created, stepped, ...) and every canonical history kind
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
