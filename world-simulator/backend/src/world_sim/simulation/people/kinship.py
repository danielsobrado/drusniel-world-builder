"""
Relationships of the cast at a scenario's start, reconstructed from its households. They
are a plausible past (origin "generated"), never an observation: a couple are spouses
only when two adults of opposite sex share a family household and their ages fit; a
child is someone's child only when the parent is old enough. Workers are tied to their
employer from a start date that fits their age; young workers to an older colleague of
the same trade as mentor.
"""

import random
from itertools import combinations
from typing import Any

from .contracts import Person
from .relationships import Ties

FAMILY_KINDS = {"multigenerational", "couple-with-children", "couple", "elder-couple", "single-parent"}
COUPLE_KINDS = {"multigenerational", "couple-with-children", "couple", "elder-couple"}


def years(p: Person, cfg: dict[str, Any], day: int = 0) -> int:
    return (day - p.birthDay) // cfg["daysPerYear"]


def _household_ties(ties: Ties, members: list[Person], kind: str, cfg: dict[str, Any]) -> None:
    year = cfg["daysPerYear"]
    grown = sorted((p for p in members if p.role != "child"), key=lambda p: p.birthDay)
    children = [p for p in members if p.role == "child"]
    gap = cfg["parentMinAge"] * year
    elder_parent = None
    if kind == "multigenerational" and len(grown) >= 2 and years(grown[0], cfg) >= 60:
        elder_parent, grown = grown[0], grown[1:]
    couple = grown[:2]
    fits = len(couple) == 2 and couple[0].sex != couple[1].sex and abs(couple[0].birthDay - couple[1].birthDay) <= 15 * year
    if kind in COUPLE_KINDS and fits:
        younger = max(couple, key=lambda p: p.birthDay)
        first_child = min((c.birthDay for c in children), default=0)
        married = min(first_child - year, younger.birthDay + cfg["marryFromAge"] * year + year)
        ties.add("spouse", couple[0].id, couple[1].id, max(married, younger.birthDay + cfg["marryFromAge"] * year), "generated")
    if elder_parent is not None and grown and grown[0].birthDay - elder_parent.birthDay >= gap:
        ties.add("parent", elder_parent.id, grown[0].id, grown[0].birthDay, "generated")
    if kind in FAMILY_KINDS:
        for child in children:
            for parent in couple if kind != "single-parent" else grown[:1]:
                if child.birthDay - parent.birthDay >= gap:
                    ties.add("parent", parent.id, child.id, child.birthDay, "generated")
        for a, b in combinations(sorted(children, key=lambda c: c.id), 2):
            if set(ties.parents(a.id)) & set(ties.parents(b.id)):
                ties.add("sibling", a.id, b.id, max(a.birthDay, b.birthDay), "generated")


def _work_ties(ties: Ties, people: list[Person], rng: random.Random, cfg: dict[str, Any]) -> None:
    year = cfg["daysPerYear"]
    starts: dict[str, int] = {}
    for p in people:
        if p.role == "worker" and p.businessId:
            earliest = p.birthDay + cfg["workFromAge"] * year
            start = max(earliest, -rng.randint(0, cfg["maxTenureYears"]) * year - rng.randint(0, year - 1))
            starts[p.id] = min(start, 0)
            ties.add("employer", p.businessId, p.id, starts[p.id], "generated")
    by_business: dict[str, list[Person]] = {}
    for p in people:
        if p.id in starts:
            by_business.setdefault(p.businessId or "", []).append(p)
    for staff in by_business.values():
        for young in (p for p in staff if years(p, cfg) <= cfg["apprenticeUntilAge"]):
            mentor = next((p for p in sorted(staff, key=lambda p: p.birthDay) if years(p, cfg) >= 30 and p.profession == young.profession),
                          None)
            if mentor:
                ties.add("mentor", mentor.id, young.id, starts[young.id], "generated", businessId=young.businessId)
        for a, b in combinations(sorted(staff, key=lambda p: p.id), 2):
            if rng.random() < cfg["coworkerFriendship"] and len(ties.of(a.id, "friend")) < 2 and len(ties.of(b.id, "friend")) < 2:
                ties.add("friend", a.id, b.id, max(starts[a.id], starts[b.id]), "generated", businessId=a.businessId)


def initial_ties(people: list[Person], households: dict[str, str], traders: list[Any], seed: int, cfg: dict[str, Any]) -> Ties:
    """`households` maps household id to its kind."""
    year = cfg["daysPerYear"]
    ties = Ties([], 0)
    for hid, kind in sorted(households.items()):
        _household_ties(ties, [p for p in people if p.householdId == hid], kind, cfg)
    _work_ties(ties, people, random.Random(f"{seed}:ties"), cfg)
    holders = {p.traderId: p for p in people if p.traderId}
    for a, b in combinations(sorted((t for t in traders if t.id in holders), key=lambda t: t.id), 2):
        if a.routeId == b.routeId and a.personality.greed >= 0.6 and b.personality.greed >= 0.6:
            ties.add("rival", holders[a.id].id, holders[b.id].id, -year, "generated", routeId=a.routeId)
    return ties
