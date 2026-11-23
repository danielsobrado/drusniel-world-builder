"""Housing, livelihood and safety: each a ratio with a status and the reason behind it. Food comes from the economy."""

from typing import Any

from .contracts import Business, Employment, Need


def status(value: float, thresholds: dict[str, float]) -> str:
    if value < thresholds["critical"]:
        return "critical"
    return "strained" if value < thresholds["strained"] else "ok"


def _need(need_id: str, label: str, value: float, thresholds: dict[str, float], explanation: str) -> Need:
    return Need(id=need_id, label=label, value=round(value, 4), status=status(value, thresholds), explanation=explanation)


def assess_needs(*, population: int, households: int, overcrowded: int, businesses: list[Business], employment: Employment,
                 cfg: dict[str, Any]) -> list[Need]:
    t = cfg["thresholds"]
    security = sum(b.filled for b in businesses if b.sector == "security")
    wanted_security = population / 1000 * cfg["securityPerThousand"]
    return [
        _need("housing", "Housing", (households - overcrowded) / households if households else 1, t,
              f"{overcrowded:,} of {households:,} households have no free dwelling and share overcrowded homes."
              if overcrowded else f"All {households:,} households are housed."),
        _need("livelihood", "Livelihood", employment.employed / employment.labourSupply if employment.labourSupply else 1, t,
              f"{employment.employed:,} of {employment.labourSupply:,} workers employed; "
              f"{employment.unemployed:,} without work, {employment.vacancies:,} posts unfilled."),
        _need("safety", "Safety", min(2.0, security / wanted_security) if wanted_security else 1, t,
              f"{security:,} guards and soldiers against {wanted_security:,.0f} wanted ({cfg['securityPerThousand']} per 1,000)."),
    ]
