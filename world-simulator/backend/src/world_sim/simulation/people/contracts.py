"""Persistent characters (schema v5): named people, their households and their life events."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ..economy.contracts import Personality

Role = Literal["child", "worker", "unemployed", "retired", "trader", "outlaw", "imprisoned"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LifeEvent(Contract):
    day: int
    kind: str
    text: str


class Person(Contract):
    id: str                          # npc:<sourceId>:<n>, stable for later exports
    name: str
    family: str
    sex: Literal["female", "male"]
    birthDay: int                    # scenario day; negative for people born before the start
    settlementId: str
    householdId: str
    role: Role
    businessId: str | None = None
    profession: str | None = None
    traderId: str | None = None      # the trade record of a caravan master
    routeId: str | None = None       # the road an outlaw works
    personality: Personality
    idleMonths: int = 0
    releaseDay: int | None = None
    retired: bool = False            # the retirement choice at 60 is made once
    alive: bool = True
    deathDay: int | None = None
    cause: str | None = None
    events: list[LifeEvent] = []


class NpcHousehold(Contract):
    id: str
    settlementId: str
    family: str
    kind: str                        # the household group it belongs to
    housing: str                     # the building type it lives in
    homeId: str | None = None        # its dwelling, while anyone in it is alive


class Dwelling(Contract):
    """One materialised building of the aggregate housing stock, home to named households."""
    id: str
    settlementId: str
    type: str
    capacity: int = Field(ge=1)      # households it holds
    households: list[str]


class NamePool(Contract):
    given: list[str]
    family: list[str]


class Cast(Contract):
    people: list[Person]
    households: list[NpcHousehold]
    dwellings: list[Dwelling] = []
    names: dict[str, NamePool]       # per settlement, for newcomers and newborns
    seq: dict[str, int]              # last person number per settlement
    budget: dict[str, int]           # people kept alive per settlement
    deaths: int = 0
    births: int = 0
    arrivals: int = 0
