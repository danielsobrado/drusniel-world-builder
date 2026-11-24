"""Persisted identity and configurable assignments for imported settlements."""

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat

Weight = Annotated[FiniteFloat, Field(ge=0, le=1)]


class PeoplesContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CivicIdentity(PeoplesContract):
    cultureId: str | None = None
    cultureSeedId: str | None = None
    polityId: str | None = None
    faithId: str | None = None


class Identity(CivicIdentity):
    ancestryId: str = "unspecified"


class Upbringing(PeoplesContract):
    cultureId: str | None = None
    cultureSeedId: str | None = None
    settlementId: str | None = None
    householdId: str | None = None


class Assignment(CivicIdentity):
    ancestryWeights: dict[str, Weight] | None = None


class Infrastructure(PeoplesContract):
    institutionId: str
    assetId: str
    demand: int = Field(ge=0)
