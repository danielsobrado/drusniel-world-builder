"""Persistent characters (schema v5): named people, their households and their life events."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ...peoples.contracts import Identity, Upbringing
from ..economy.contracts import Personality
from .relationships import Relationship

Role = Literal["child", "worker", "unemployed", "retired", "trader", "outlaw", "imprisoned"]


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class LifeEvent(Contract):
    day: int
    kind: str
    text: str
    eventId: str | None = None       # the canonical event, once recorded


class Knowledge(Contract):
    """Something a person learned second-hand. First-hand and local knowledge are derived, not stored."""
    eventId: str
    learnedDay: int
    how: Literal["told", "rumour"]
    fromId: str | None = None        # who told them, when known
    confidence: float = Field(ge=0, le=1)


class Profile(Contract):
    """Stable character beyond the three traits; fears, ambitions and concerns are derived from circumstances instead."""
    temperament: Literal["reserved", "sociable", "assertive"]
    values: list[str]                # two of duty, family, wealth, faith, knowledge, in order


class Person(Contract):
    id: str                          # npc:<sourceId>:<n>, stable for later exports
    name: str
    family: str
    sex: Literal["female", "male"]
    birthDay: int                    # scenario day; negative for people born before the start
    settlementId: str
    birthplaceId: str | None = None   # where they were born (an Azgaar settlement), for origins and places known
    householdId: str
    journeyId: str | None = None
    visited: dict[str, int] = {}
    identity: Identity = Identity()
    upbringing: Upbringing = Upbringing()
    role: Role
    businessId: str | None = None
    profession: str | None = None
    traderId: str | None = None      # the trade record of a caravan master
    routeId: str | None = None       # the road an outlaw works
    personality: Personality
    profile: Profile | None = None
    idleMonths: int = 0
    releaseDay: int | None = None
    retired: bool = False            # the retirement choice at 60 is made once
    backstory: bool = False          # their past before entering the record has been reconstructed
    alive: bool = True
    deathDay: int | None = None
    cause: str | None = None
    events: list[LifeEvent] = []      # recent-events cache; the archive keeps everything
    timeline: list[str] = []          # permanent references to the canonical events that shaped this life
    knowledge: list[Knowledge] = []   # second-hand only, newest kept


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
    places: dict[str, str] = {}      # names of birthplaces outside the scenario's scope
    relationships: list[Relationship] = []
    relSeq: int = 0
    budget: dict[str, int]           # people kept alive per settlement
    deaths: int = 0
    births: int = 0
    arrivals: int = 0
