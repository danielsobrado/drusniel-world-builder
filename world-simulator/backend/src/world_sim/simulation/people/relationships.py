"""
Explicit relationships between named people (and between a business and its workers).
Living together establishes nothing by itself: every tie is recorded with when it began,
how, and whether it has ended. Directed kinds read "a is the <kind> of b": parent, mentor,
employer (a is a business id). Spouse, sibling, friend and rival are mutual.
"""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Kind = Literal["parent", "spouse", "sibling", "friend", "rival", "mentor", "employer"]
MUTUAL = {"spouse", "sibling", "friend", "rival"}
TRUST = {"parent": 0.6, "spouse": 0.8, "sibling": 0.5, "friend": 0.6, "rival": -0.5, "mentor": 0.4, "employer": 0.2}


class Relationship(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Kind
    a: str
    b: str
    since: int                            # simulation day; negative before the scenario
    until: int | None = None
    origin: str | None = None             # the event that established it, or "generated" for a reconstructed past
    trust: float = Field(0.0, ge=-1, le=1)
    facts: dict[str, str | int | float | None] = {}

    @property
    def active(self) -> bool:
        return self.until is None


class Ties:
    """A mutable working set over a cast's relationships for one month (or one baseline)."""

    def __init__(self, relationships: list[Relationship], seq: int):
        self.items = list(relationships)
        self.seq = seq

    def add(self, kind: str, a: str, b: str, day: int, origin: str | None = None, **facts: str | int | float | None) -> Relationship:
        self.seq += 1
        rel = Relationship(id=f"rel:{self.seq}", kind=kind, a=a, b=b, since=day, origin=origin, trust=TRUST[kind], facts=facts)
        self.items.append(rel)
        return rel

    def of(self, person: str, kind: str | None = None, active: bool = True) -> list[Relationship]:
        return [r for r in self.items if person in (r.a, r.b) and (kind is None or r.kind == kind) and (not active or r.active)]

    def other(self, rel: Relationship, person: str) -> str:
        return rel.b if rel.a == person else rel.a

    def spouse(self, person: str) -> str | None:
        found = self.of(person, "spouse")
        return self.other(found[0], person) if found else None

    def parents(self, person: str) -> list[str]:
        return [r.a for r in self.items if r.kind == "parent" and r.b == person]

    def children(self, person: str) -> list[str]:
        return [r.b for r in self.items if r.kind == "parent" and r.a == person]

    def linked(self, a: str, b: str, kind: str) -> bool:
        return any(r.kind == kind and r.active and {r.a, r.b} == {a, b} for r in self.items)

    def end(self, person: str, day: int, kinds: set[str] | None = None, entity: str | None = None) -> list[Relationship]:
        """Ends the person's active ties of these kinds (and only with `entity`, when given)."""
        ended = []
        for i, r in enumerate(self.items):
            if r.active and person in (r.a, r.b) and (kinds is None or r.kind in kinds) and (entity is None or entity in (r.a, r.b)):
                self.items[i] = r.model_copy(update={"until": day})
                ended.append(self.items[i])
        return ended

    def adjust(self, a: str, b: str, delta: float) -> None:
        for i, r in enumerate(self.items):
            if r.active and {r.a, r.b} == {a, b}:
                self.items[i] = r.model_copy(update={"trust": round(max(-1.0, min(1.0, r.trust + delta)), 3)})
