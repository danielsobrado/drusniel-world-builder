"""Labour supply from cohorts, and a deterministic priority fill of business staffing."""

import math

from .contracts import Business, Cohorts, Employment, SectorEmployment


def labour_supply(cohorts: Cohorts, participation: dict[str, float]) -> int:
    return math.floor(cohorts.adults * participation["adults"] + cohorts.elders * participation["elders"])


def fill_jobs(businesses: list[Business], supply: int, priority: list[str]) -> tuple[list[Business], Employment, list[SectorEmployment]]:
    """Sectors fill in priority order, businesses in id order; never more workers than the supply."""
    rank = {sector: i for i, sector in enumerate(priority)}
    order = sorted(range(len(businesses)), key=lambda i: (rank.get(businesses[i].sector, len(rank)), businesses[i].id))
    filled = [0] * len(businesses)
    left = supply
    for i in order:
        take = min(left, businesses[i].staff)
        filled[i], left = take, left - take
    updated = [b if b.filled == f else b.model_copy(update={"filled": f}) for b, f in zip(businesses, filled, strict=True)]
    employed = supply - left
    demand = sum(b.staff for b in businesses)
    sectors = []
    for sector in sorted({b.sector for b in businesses}, key=lambda s: rank.get(s, len(rank))):
        members = [b for b in updated if b.sector == sector]
        sectors.append(SectorEmployment(sector=sector, businesses=len(members), demand=sum(b.staff for b in members),
                                        filled=sum(b.filled for b in members)))
    wage_bill = sum(b.filled * b.wage for b in updated) * 30
    return updated, Employment(labourSupply=supply, employed=employed, unemployed=supply - employed,
                               vacancies=demand - employed, wageBillPerMonth=wage_bill), sectors
