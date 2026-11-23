"""Canonical history (schema v1 of the event record): what happened, to whom, why, and with what effect."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Category = Literal["birth", "family", "education", "career", "wealth", "travel", "social", "crime", "conflict", "health",
                   "settlement", "trade"]
Source = Literal["simulation", "imported", "generated-prehistory", "inferred", "player", "intervention"]
Precision = Literal["day", "month", "year", "approximate"]
Visibility = Literal["public", "settlement", "household", "participants", "private"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Participant(Contract):
    personId: str
    role: str


class Effect(Contract):
    entityId: str
    kind: str
    severity: float = Field(ge=0, le=1)


class HistoryEvent(Contract):
    """One thing that happened, recorded once and linked to everyone involved."""
    schemaVersion: int = 1
    id: str                                   # event:<n>, numbered per scenario
    seq: int                                  # the scenario's event counter; restores and branches cut the archive here
    day: int                                  # effective simulation day; negative before the scenario began
    datePrecision: Precision
    kind: str
    category: Category
    source: Source
    settlementId: str | None = None
    locationId: str | None = None             # a route, building or settlement where it happened
    routeId: str | None = None
    businessId: str | None = None
    caravanId: str | None = None
    householdId: str | None = None
    participants: list[Participant] = []
    relatedEntities: list[str] = []
    facts: dict[str, int | float | str | bool | None] = {}
    causedBy: list[str] = []                  # earlier events that contributed, when the simulation established it
    effects: list[Effect] = []
    importance: int = Field(ge=1, le=5)
    visibility: Visibility
    summary: str
