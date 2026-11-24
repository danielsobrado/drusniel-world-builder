"""Distribute and track ancestry cohorts without changing population totals."""

import math

from ..simulation.contracts import Cohorts
from ..simulation.demography import initial_cohorts
from .catalog import NEUTRAL

BANDS = ("children", "adults", "elders")


def apportion(total: int, weights: dict[str, float]) -> dict[str, int]:
    denominator = sum(weights.values())
    if not denominator:
        return {key: 0 for key in weights}
    quotas = {key: total * value / denominator for key, value in weights.items()}
    rounded = {key: math.floor(value) for key, value in quotas.items()}
    order = sorted(quotas, key=lambda key: (rounded[key] - quotas[key], key))
    for key in order[:total - sum(rounded.values())]:
        rounded[key] += 1
    return rounded


def combined(cohorts: dict[str, Cohorts]) -> Cohorts:
    return Cohorts(**{band: sum(getattr(c, band) for c in cohorts.values()) for band in BANDS})


def established(cohorts: Cohorts, weights: dict[str, float]) -> dict[str, Cohorts]:
    """Old saves keep their exact current age bands and acquire ancestry within each band."""
    splits = {band: apportion(getattr(cohorts, band), weights) for band in BANDS}
    return {key: Cohorts(**{band: splits[band][key] for band in BANDS}) for key in sorted(weights) if weights[key] > 0}


def initial(population: int, weights: dict[str, float], ancestries: dict, demo: dict) -> dict[str, Cohorts]:
    if not any(ancestries.get(key, {}).get("initialShares") for key in weights):
        return established(initial_cohorts(population, demo["initialShares"]), weights)
    sizes = apportion(population, weights)
    return {key: initial_cohorts(sizes[key], ancestries.get(key, {}).get("initialShares", demo["initialShares"]))
            for key in sorted(sizes) if weights[key] > 0}


def ancestry_counts(settlements: list) -> dict[str, dict[str, int]]:
    return {s.settlementId: {key: value.total for key, value in s.ancestries.items()} for s in settlements}


def weights_for_band(ancestries: dict[str, Cohorts], band: str) -> dict[str, int]:
    band = {"child": "children", "adult": "adults", "elder": "elders"}[band]
    weights = {key: getattr(cohorts, band) for key, cohorts in ancestries.items()}
    return weights if sum(weights.values()) else {NEUTRAL: 1}


def transfer(source: dict[str, Cohorts], destination: dict[str, Cohorts], adults: int,
             children: int) -> tuple[dict[str, Cohorts], dict[str, Cohorts], dict[str, Cohorts]]:
    departing = {"adults": apportion(adults, {key: c.adults for key, c in source.items()}),
                 "children": apportion(children, {key: c.children for key, c in source.items()})}
    empty = Cohorts(children=0, adults=0, elders=0)
    source, destination = dict(source), dict(destination)
    moved = {}
    for key, cohorts in source.items():
        a, c = (departing[band][key] for band in ("adults", "children"))
        if a or c:
            resident = destination.get(key, empty)
            source[key] = Cohorts(adults=cohorts.adults - a, children=cohorts.children - c, elders=cohorts.elders)
            moved[key] = Cohorts(adults=a, children=c, elders=0)
            destination[key] = Cohorts(adults=resident.adults + a, children=resident.children + c, elders=resident.elders)
    return source, destination, moved
