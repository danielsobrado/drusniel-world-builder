"""
Monthly cohort demography: births to adults, deaths in every band, ageing between bands.
Fractional expectations become whole people by seeded stochastic rounding, with one RNG
per (seed, month, settlement), so stepping 100 days at once equals 100 single days.
"""

import math
import random
from typing import Any

from .contracts import Cohorts, SettlementState, Vitals


def initial_cohorts(population: int, shares: dict[str, float]) -> Cohorts:
    """Largest-remainder split, so the cohorts always sum to the imported population."""
    bands = ("children", "adults", "elders")
    exact = [population * shares[b] / sum(shares.values()) for b in bands]
    counts = [math.floor(x) for x in exact]
    for i in sorted(range(3), key=lambda i: (-(exact[i] - counts[i]), i))[: population - sum(counts)]:
        counts[i] += 1
    return Cohorts(**dict(zip(bands, counts, strict=True)))


def _draw(rng: random.Random, expected: float, cap: int) -> int:
    whole = math.floor(expected)
    return min(cap, whole + (1 if rng.random() < expected - whole else 0))


def run_month(settlement: SettlementState, *, seed: int, month_index: int, params: dict[str, Any], months_per_year: int,
              mortality: float = 1.0) -> SettlementState:
    """One month for one settlement; `mortality` scales death rates (famine). Births - deaths stay exact in the totals."""
    rng = random.Random(f"{seed}:{month_index}:{settlement.settlementId}")
    c = settlement.cohorts
    death = {band: rate * mortality for band, rate in params["deathRatePerYear"].items()}
    years = params["bandYears"]
    births = _draw(rng, c.adults * params["birthsPerAdultPerYear"] / months_per_year, 10**9)
    dead_children = _draw(rng, c.children * death["children"] / months_per_year, c.children)
    dead_adults = _draw(rng, c.adults * death["adults"] / months_per_year, c.adults)
    dead_elders = _draw(rng, c.elders * death["elders"] / months_per_year, c.elders)
    children, adults, elders = c.children - dead_children, c.adults - dead_adults, c.elders - dead_elders
    grown = _draw(rng, children / (years["children"] * months_per_year), children)
    aged = _draw(rng, adults / (years["adults"] * months_per_year), adults)
    cohorts = Cohorts(children=children - grown + births, adults=adults + grown - aged, elders=elders + aged)
    deaths = dead_children + dead_adults + dead_elders
    if cohorts.total != settlement.population + births - deaths:
        raise AssertionError(f"demography broke population accounting for {settlement.settlementId}")
    return settlement.model_copy(update={
        "cohorts": cohorts,
        "population": cohorts.total,
        "births": settlement.births + births,
        "deaths": settlement.deaths + deaths,
        "vitals": Vitals(births=births, deaths={"children": dead_children, "adults": dead_adults, "elders": dead_elders}),
    })
