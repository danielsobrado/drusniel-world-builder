"""
Aggregate households: groups of identical-composition households derived from the
settlement's age cohorts. Every child, adult and elder lands in exactly one group,
and children only ever live with an adult, so households never create or lose people.
"""

import math
from typing import Any

from .contracts import Cohorts, HouseholdGroup

LABELS = {
    "multigenerational": "Multigenerational family",
    "couple-with-children": "Couple with children",
    "single-parent": "Single parent",
    "couple": "Couple",
    "single": "Single adult",
    "elder-couple": "Elder couple",
    "elder-single": "Elder living alone",
    "communal": "Communal household",
}


def derive_households(cohorts: Cohorts, cfg: dict[str, Any]) -> list[HouseholdGroup]:
    children, adults, elders = cohorts.children, cohorts.adults, cohorts.elders
    # Elders living with a family; each such family has two adults.
    multigen = min(math.floor(elders * cfg["multigenerationalElderShare"]), adults // 2)
    other_elders = elders - multigen
    elder_couples = math.floor(other_elders * cfg["elderCoupleShare"] / 2)
    elder_singles = other_elders - 2 * elder_couples
    free_adults = adults - 2 * multigen

    # Child-rearing households needed for the children, minus the multigenerational ones.
    rearing = math.ceil(children / cfg["meanChildrenPerFamily"]) if children else 0
    families = max(0, rearing - multigen)
    single_parents = round(families * cfg["singleParentShare"])
    couples_kids = families - single_parents
    while 2 * couples_kids + single_parents > free_adults and families > 0:
        # Too few adults: convert couples to single parents, then drop families.
        if couples_kids > 0:
            couples_kids, single_parents = couples_kids - 1, single_parents + 1
        else:
            single_parents -= 1
        families = couples_kids + single_parents
    free_adults -= 2 * couples_kids + single_parents

    carers = multigen + couples_kids + single_parents
    kids_multigen = children * multigen // carers if carers else 0
    kids_couples = children * couples_kids // carers if carers else 0
    kids_single = children - kids_multigen - kids_couples if carers else 0
    orphans = children if not carers else 0

    couples = math.floor(free_adults * cfg["adultCoupleShare"] / 2)
    singles = free_adults - 2 * couples

    rows = [
        ("multigenerational", multigen, 2 * multigen, kids_multigen, multigen),
        ("couple-with-children", couples_kids, 2 * couples_kids, kids_couples, 0),
        ("single-parent", single_parents, single_parents, kids_single, 0),
        ("couple", couples, 2 * couples, 0, 0),
        ("single", singles, singles, 0, 0),
        ("elder-couple", elder_couples, 0, 0, 2 * elder_couples),
        ("elder-single", elder_singles, 0, 0, elder_singles),
        ("communal", 1 if orphans else 0, 0, orphans, 0),  # only when no adult can take children in
    ]
    groups = [HouseholdGroup(kind=k, label=LABELS[k], households=h, adults=a, children=c, elders=e)
              for k, h, a, c, e in rows if h > 0]
    totals = (sum(g.children for g in groups), sum(g.adults for g in groups), sum(g.elders for g in groups))
    if totals != (children, adults, elders):
        raise AssertionError(f"households lost people: {totals} != {(children, adults, elders)}")
    return groups
