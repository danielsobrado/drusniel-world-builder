"""Assign ancestry to legacy living characters using the saved census as capacity."""

from collections import defaultdict
from typing import Any

from ...peoples.catalog import choose_ancestry
from ...peoples.physiology import person_rules
from ..contracts import SettlementState
from .generate import band_of

COHORT_BAND = {"child": "children", "adult": "adults", "elder": "elders"}
Slot = tuple[str, str]


def assign_residents(town: SettlementState, residents: list[dict[str, Any]], *, day: int, seed: int, cfg: dict) -> dict[str, str]:
    """Each named resident reserves one slot in a band computed using the candidate ancestry's age rules."""
    capacity = {(ancestry, band): getattr(cohort, field)
                for ancestry, cohort in town.ancestries.items() for band, field in COHORT_BAND.items()}
    ages = {key: person_rules(cfg, key) for key in town.ancestries}
    choices: dict[str, list[Slot]] = {}
    for person in residents:
        pid = person["id"]
        age = (day - person["birthDay"]) // cfg["daysPerYear"]
        possible = [(key, band_of(age, settings)) for key, settings in ages.items()]
        options = sorted((slot for slot in possible if capacity[slot]), key=lambda slot: (-capacity[slot], slot))
        if options:
            first = choose_ancestry({key: capacity[key, band] for key, band in options}, seed, pid)
            options.sort(key=lambda slot: slot[0] != first)
        choices[pid] = options

    assigned: dict[str, Slot] = {}
    occupants: dict[Slot, list[str]] = defaultdict(list)

    def reserve(pid: str, seen: set[Slot]) -> bool:
        # Try free slots first. If needed, move an occupant to another compatible band before taking its slot.
        for slot in choices[pid]:
            if slot not in seen and len(occupants[slot]) < capacity[slot]:
                assigned[pid] = slot
                occupants[slot].append(pid)
                return True
        for slot in choices[pid]:
            if slot in seen:
                continue
            seen.add(slot)
            for index, other in enumerate(occupants[slot]):
                if reserve(other, seen):
                    occupants[slot][index] = pid
                    assigned[pid] = slot
                    return True
        return False

    for pid in sorted(choices, key=lambda key: (len(choices[key]), key)):
        if not reserve(pid, set()):
            raise ValueError(f"{town.name}: {pid} cannot fit within the saved ancestry and age cohorts")
    return {pid: slot[0] for pid, slot in assigned.items()}
