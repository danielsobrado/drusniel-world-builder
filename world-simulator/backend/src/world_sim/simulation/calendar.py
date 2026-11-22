"""Day-based calendar: day 0 is the first day of the start year."""

from typing import Any

from .contracts import CalendarDate


def date_for(day: int, start_year: int, calendar: dict[str, Any]) -> CalendarDate:
    per_month, per_year = calendar["daysPerMonth"], calendar["daysPerMonth"] * calendar["monthsPerYear"]
    year = start_year + day // per_year
    month = (day % per_year) // per_month + 1
    day_of_month = day % per_month + 1
    return CalendarDate(day=day, year=year, month=month, dayOfMonth=day_of_month, label=f"{year}-{month:02d}-{day_of_month:02d}")


def resolve_start_year(calendar: dict[str, Any], source_year: Any) -> int:
    configured = calendar.get("startYear", "source")
    if configured == "source":
        return int(source_year) if isinstance(source_year, (int, float)) else 1
    return int(configured)
