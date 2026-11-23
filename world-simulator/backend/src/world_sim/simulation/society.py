"""
A settlement's social and working structure. Built once from the imported settlement
(housing stock and businesses stay fixed in PR3), then re-derived from the cohorts every
month: households regroup, homes re-occupy, jobs refill and needs re-assess.
"""

from typing import Any

from .businesses import generate_businesses
from .contracts import Cohorts, Society
from .employment import fill_jobs, labour_supply
from .households import derive_households
from .housing import build_housing, occupy
from .needs import assess_needs


def _assemble(cohorts: Cohorts, housing, businesses, cfg: dict[str, Any], days_per_month: int) -> Society:
    groups = derive_households(cohorts, cfg["households"])
    households = sum(g.households for g in groups)
    housing, overcrowded = occupy(housing, households)
    supply = labour_supply(cohorts, cfg["labour"]["participation"])
    businesses, employment, sectors = fill_jobs(businesses, supply, cfg["labour"]["priority"], days_per_month)
    needs = assess_needs(population=cohorts.total, households=households, overcrowded=overcrowded,
                         businesses=businesses, employment=employment, cfg=cfg["needs"])
    return Society(households=groups, housing=housing, overcrowdedHouseholds=overcrowded, businesses=businesses,
                   employment=employment, sectors=sectors, needs=needs)


def initial_society(settlement: dict[str, Any], cohorts: Cohorts, cfg: dict[str, Any], days_per_month: int) -> Society:
    households = sum(g.households for g in derive_households(cohorts, cfg["households"]))
    housing = build_housing(households, settlement["class"], cfg["housing"])
    businesses = generate_businesses(settlement, labour_supply(cohorts, cfg["labour"]["participation"]), cfg)
    return _assemble(cohorts, housing, businesses, cfg, days_per_month)


def update_society(society: Society, cohorts: Cohorts, cfg: dict[str, Any], days_per_month: int) -> Society:
    return _assemble(cohorts, society.housing, society.businesses, cfg, days_per_month)


def check_invariants(population: int, cohorts: Cohorts, society: Society) -> list[str]:
    """Accounting rules that must hold after every step; returns the broken ones."""
    broken = []
    members = (sum(g.children for g in society.households), sum(g.adults for g in society.households),
               sum(g.elders for g in society.households))
    if members != (cohorts.children, cohorts.adults, cohorts.elders) or cohorts.total != population:
        broken.append("households do not account for the population")
    if any(g.children and not (g.adults or g.kind == "communal") for g in society.households):
        broken.append("children in a household without an adult")
    households = sum(g.households for g in society.households)
    if sum(h.occupied for h in society.housing) + society.overcrowdedHouseholds != households:
        broken.append("housing occupancy does not match households")
    if any(h.occupied > h.capacity for h in society.housing):
        broken.append("a housing type is over capacity")
    if any(b.filled > b.staff or b.filled < 0 for b in society.businesses):
        broken.append("a business is staffed beyond its posts")
    if society.employment.employed > society.employment.labourSupply:
        broken.append("more jobs filled than eligible workers")
    if sum(b.filled for b in society.businesses) != society.employment.employed:
        broken.append("employment total does not match businesses")
    return broken
