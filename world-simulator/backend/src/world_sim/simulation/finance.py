"""Aggregate household purchasing power, savings and housing arrears in copper."""

import math

from pydantic import BaseModel, ConfigDict, Field


class FinanceTier(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    households: int = Field(ge=0)
    savings: float = Field(default=0, ge=0)
    arrears: float = Field(default=0, ge=0)
    income: float = Field(default=0, ge=0)
    spent: float = Field(default=0, ge=0)
    foodAccess: float = Field(default=1, ge=0, le=1)


class HouseholdFinances(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tiers: list[FinanceTier] = []
    foodAccess: float = Field(default=1, ge=0, le=1)
    strugglingHouseholds: int = Field(default=0, ge=0)
    hardshipMonths: int = Field(default=0, ge=0)


def _sizes(total: int, cfg: dict) -> dict[str, int]:
    shares = {key: item["share"] for key, item in cfg["tiers"].items()}
    if not math.isclose(sum(shares.values()), 1, abs_tol=1e-6):
        raise ValueError("household finances tier shares must sum to one")
    counts = {key: math.floor(total * share) for key, share in shares.items()}
    order = sorted(shares, key=lambda key: (-(total * shares[key] - counts[key]), key))
    for key in order[:total - sum(counts.values())]:
        counts[key] += 1
    return counts


def baseline(households: int, cfg: dict) -> HouseholdFinances:
    if not cfg.get("enabled", False):
        return HouseholdFinances()
    sizes = _sizes(households, cfg)
    tiers = [FinanceTier(name=name, households=sizes[name],
                         savings=round(sizes[name] * item["initialSavings"], 2))
             for name, item in cfg["tiers"].items()]
    return HouseholdFinances(tiers=tiers)


def month(previous: HouseholdFinances, *, households: int, population: int, income: float,
          ration_price: float, ration_multiplier: float, rations_per_person_day: float,
          days: int, cfg: dict) -> HouseholdFinances:
    if not cfg.get("enabled", False) or not households:
        return previous
    counts = _sizes(households, cfg)
    old = {tier.name: tier for tier in previous.tiers}
    weights = {name: counts[name] * item["wageWeight"] for name, item in cfg["tiers"].items()}
    weight_total = sum(weights.values())
    full_food = population * ration_multiplier * rations_per_person_day * days
    full_food_cost = full_food * ration_price * cfg["copperPerTradeValue"]
    tiers = []
    paid_food, food_due, struggling = 0.0, 0.0, 0
    for name, item in cfg["tiers"].items():
        count = counts[name]
        before = old.get(name)
        savings = before.savings if before else 0.0
        arrears = before.arrears if before else 0.0
        earned = income * weights[name] / weight_total if weight_total else 0.0
        owed_food = full_food_cost * count / households
        owed_home = count * cfg["housingCostPerHousehold"]
        cash = savings + earned
        food_spent = min(cash, owed_food)
        housing_spent = min(cash - food_spent, owed_home)
        arrears = min(count * cfg["maxArrearsPerHousehold"], arrears + owed_home - housing_spent)
        extra = cash - food_spent - housing_spent
        payment = min(arrears, extra * cfg["debtRepaymentShare"])
        arrears -= payment
        savings = max(0.0, extra - payment)
        access = food_spent / owed_food if owed_food else 1.0
        paid_food += food_spent
        food_due += owed_food
        struggling += round(count * (1 - access))
        tiers.append(FinanceTier(name=name, households=count, savings=round(savings, 2),
                                 arrears=round(arrears, 2), income=round(earned, 2),
                                 spent=round(food_spent + housing_spent, 2),
                                 foodAccess=round(access, 4)))
    access = min(1.0, paid_food / food_due) if food_due else 1.0
    return HouseholdFinances(tiers=tiers, foodAccess=round(access, 4),
                             strugglingHouseholds=struggling,
                             hardshipMonths=previous.hardshipMonths + 1 if access < 0.95 else 0)
