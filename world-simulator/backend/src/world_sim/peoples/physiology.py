"""Optional species parameters. Unauthored traits use the scenario's neutral rules."""

import math


def validate_ancestries(ancestries: dict) -> None:
    if "unspecified" not in ancestries:
        raise ValueError("ancestries.yaml needs an unspecified ancestry")
    for key, row in ancestries.items():
        if not isinstance(row.get("label"), str) or not row["label"].strip():
            raise ValueError(f"Ancestry {key} needs a label")
        ages = row.get("ages")
        if ages:
            if set(ages) != {"child", "adult", "elder"} or any(
                    len(pair) != 2 or any(type(age) is not int or age < 0 for age in pair) or pair[0] > pair[1]
                    for pair in ages.values()):
                raise ValueError(f"Invalid age bands for {key}")
            child, adult, elder = (ages[band] for band in ("child", "adult", "elder"))
            if child[0] != 0 or child[1] + 1 != adult[0] or adult[1] + 1 != elder[0] or adult[0] == 0:
                raise ValueError(f"Age bands for {key} must be contiguous from birth")
        life = row.get("lifespanYears")
        if life is not None:
            if not ages or type(life) is not int or life <= ages["elder"][0]:
                raise ValueError(f"Expected lifespan for {key} must exceed its explicit elder-band starting age")
        habitats = row.get("environmentMortality", {})
        if not isinstance(habitats, dict) or any(
                not isinstance(name, str) or not name or type(value) not in (int, float) or not math.isfinite(value) or value < 0
                for name, value in habitats.items()):
            raise ValueError(f"Invalid environment mortality multipliers for {key}")
        for field in ("birthsPerAdultPerYear", "foodMultiplier"):
            value = row.get(field, 1)
            if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
                raise ValueError(f"Invalid {field} for {key}")
        if "retireFrom" in row and (type(row["retireFrom"]) is not int or row["retireFrom"] < 0):
            raise ValueError(f"Invalid retirement age for {key}")
        if "fertilityAges" in row:
            pair = row["fertilityAges"]
            if len(pair) != 2 or any(type(age) is not int or age < 0 for age in pair) or pair[0] > pair[1]:
                raise ValueError(f"Invalid fertility ages for {key}")
        for field in ("initialShares", "deathRatePerYear"):
            if field not in row:
                continue
            bands = row[field]
            if set(bands) != {"children", "adults", "elders"} or any(
                    type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= 1 for value in bands.values()):
                raise ValueError(f"Invalid {field} age-band values for {key}")
            if field == "initialShares" and not math.isclose(sum(bands.values()), 1, abs_tol=1e-6):
                raise ValueError(f"Initial age-band shares for {key} must sum to one")


def person_rules(neutral: dict, ancestry: str) -> dict:
    settings = neutral.get("ancestries", {}).get(ancestry, {})
    if not settings.get("ages"):
        return {**neutral, **{k: settings[k] for k in ("retireFrom", "fertilityAges") if k in settings}}
    ages = settings["ages"]
    adult = ages["adult"]
    return {**neutral, "ages": ages, "traderAges": adult, "retireFrom": settings.get("retireFrom", ages["elder"][0]),
            "fertilityAges": settings.get("fertilityAges", adult)}


def demographic_rules(neutral: dict, settings: dict) -> dict:
    overrides = {key: settings[key] for key in ("birthsPerAdultPerYear", "deathRatePerYear") if key in settings}
    if ages := settings.get("ages"):
        overrides["bandYears"] = {"children": ages["adult"][0], "adults": ages["elder"][0] - ages["adult"][0]}
    if "lifespanYears" in settings and "deathRatePerYear" not in overrides:
        remaining = settings["lifespanYears"] - settings["ages"]["elder"][0]
        overrides["deathRatePerYear"] = {**neutral["deathRatePerYear"], "elders": 1 / remaining}
    return {**neutral, **overrides}


def food_multiplier(ancestries: dict, cohorts: dict) -> float:
    size = sum(c.total for c in cohorts.values())
    return sum(c.total * ancestries.get(key, {}).get("foodMultiplier", 1) for key, c in cohorts.items()) / size if size else 1
