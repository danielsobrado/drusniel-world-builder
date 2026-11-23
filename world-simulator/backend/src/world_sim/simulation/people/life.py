"""
A month in the lives of the named people. They age, come of age and retire; find and
lose work as their town's labour market allows and as businesses close; the idle and
dishonest may take to their road with its bandits and be caught; masters lose their
post when dismissed. The dead are replaced by newborns or newcomers, so each
settlement keeps exactly its NPC budget.
"""

import random
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from ..contracts import Business, SettlementState
from ..economy.contracts import Route, Trade, Trader
from .contracts import Cast, Person
from .generate import age_years, band_of
from .notes import note
from .replace import promote_traders, replace_dead


@dataclass
class Town:
    """What a person's life this month depends on in their settlement."""
    settlement: SettlementState
    businesses: dict[str, Business]
    named: Counter
    route: Route | None
    outlaws: int
    unemployment: float
    mortality: float


@dataclass
class Month:
    day: int
    seed: int
    cfg: dict[str, Any]
    cfg_economy: dict[str, Any]
    death_rates: dict[str, float]          # per year, by child / adult / elder
    traders: dict[str, Trader]
    recent: int = 24
    incidents: list[dict[str, Any]] = field(default_factory=list)


def _towns(cast: Cast, settlements: list[SettlementState], routes: list[Route], famine: float) -> dict[str, Town]:
    towns = {}
    for s in settlements:
        e = s.society.employment
        named = Counter(p.businessId for p in cast.people if p.alive and p.settlementId == s.settlementId and p.role == "worker")
        route = next((r for r in routes if r.settlementId == s.settlementId), None)
        outlaws = sum(1 for p in cast.people if p.alive and p.role == "outlaw" and route and p.routeId == route.id)
        towns[s.settlementId] = Town(s, {b.id: b for b in s.society.businesses}, named, route, outlaws,
                                     e.unemployed / e.labourSupply if e.labourSupply else 0.0,
                                     1 + famine * max(0.0, 1 - s.economy.food.security))
    return towns


def _work(p: Person, town: Town, m: Month, rng: random.Random) -> Person:
    c = m.cfg
    if p.role == "worker":
        business = town.businesses.get(p.businessId or "")
        if business is None or town.named[p.businessId] > business.filled:
            town.named[p.businessId] -= 1
            what = f"{business.name} let workers go" if business else "their workplace closed"
            return note(p, m, "lost-work", f"Lost work: {what}",
                        related={"businessId": p.businessId, "facts": {"closed": business is None}},
                        role="unemployed", businessId=None, profession=None, idleMonths=0)
        if rng.random() < c["loseWorkPerMonth"] * town.unemployment:
            town.named[p.businessId] -= 1
            return note(p, m, "lost-work", f"Let go by {business.name}", related={"businessId": p.businessId},
                        role="unemployed", businessId=None, profession=None, idleMonths=0)
        return p
    if p.role != "unemployed":
        return p
    p = p.model_copy(update={"idleMonths": p.idleMonths + 1})
    if rng.random() < c["findWorkPerMonth"] * (1 - town.unemployment):
        posts = [b for b in town.businesses.values() if b.filled > town.named[b.id]]
        if posts:
            b = rng.choices(posts, weights=[x.filled - town.named[x.id] for x in posts])[0]
            town.named[b.id] += 1
            return note(p, m, "hired", f"Hired as {b.profession} at {b.name}",
                        related={"businessId": b.id, "facts": {"profession": b.profession, "monthsIdle": p.idleMonths}},
                        role="worker", businessId=b.id, profession=b.profession, idleMonths=0)
    o, t = c["outlaw"], p.personality
    if (town.route and p.idleMonths >= o["idleMonths"] and t.honesty <= o["maxHonesty"] and t.greed >= o["minGreed"]
            and rng.random() < o["chance"]):
        town.outlaws += 1
        way = "sea lane" if town.route.mode == "sea" else "road"
        band = "pirates" if way == "sea lane" else "bandits"
        return note(p, m, "outlaw", f"Took to the {way} with the {band}",
                    message=f"{p.name} {p.family} of {town.settlement.name} took to the {way} to {town.route.centerName} after "
                            f"{p.idleMonths} months without work",
                    related={"routeId": town.route.id, "facts": {"monthsIdle": p.idleMonths}}, role="outlaw", routeId=town.route.id)
    return p


def _outlaw(p: Person, town: Town, m: Month, rng: random.Random) -> Person:
    c, route = m.cfg, town.route
    if route is None or route.id != p.routeId or route.bandits < town.outlaws:
        town.outlaws -= 1
        return note(p, m, "came-home", "Came home when the band broke up", related={"routeId": p.routeId}, role="unemployed",
                    routeId=None, idleMonths=0)
    caught = route.removed / max(1, route.bandits + route.removed)
    if rng.random() < caught:
        town.outlaws -= 1
        return note(p, m, "caught", "Caught by a patrol and imprisoned",
                    message=f"{p.name} {p.family}, outlaw on the {town.settlement.name} road, was caught and imprisoned",
                    related={"routeId": route.id, "facts": {"prisonDays": c["prisonDays"]}}, role="imprisoned", routeId=None,
                    releaseDay=m.day + c["prisonDays"])
    if rng.random() < c["outlaw"]["giveUpPerMonth"]:
        town.outlaws -= 1
        return note(p, m, "came-home", "Gave up the outlaw's life and came home", related={"routeId": p.routeId}, role="unemployed",
                    routeId=None, idleMonths=0)
    return p


def _live(p: Person, town: Town, m: Month) -> Person:
    c = m.cfg
    rng = random.Random(f"{m.seed}:{m.day}:{p.id}")
    age = age_years(p, m.day)
    rate = m.death_rates[band_of(age, c)] / 12 * town.mortality * (2 if p.role == "outlaw" else 1)
    if rng.random() < rate:
        if p.role == "worker":
            town.named[p.businessId] -= 1
        if p.role == "outlaw":
            town.outlaws -= 1
        # Deaths are drawn from rates; no cause is modelled, so none is claimed (a food shortage is only a fact of the time).
        cause = "while an outlaw" if p.role == "outlaw" else "cause not recorded"
        return note(p, m, "died", f"Died at {age}", message=f"{p.name} {p.family} died at {age}",
                    related={"facts": {"age": age, "duringFoodShortage": town.mortality > 1.05}}, alive=False, deathDay=m.day, cause=cause)
    if p.role == "imprisoned" and m.day >= (p.releaseDay or 0):
        return note(p, m, "released", "Released from prison", role="unemployed", releaseDay=None, idleMonths=0)
    if p.role == "child" and age >= c["ages"]["adult"][0]:
        return note(p, m, "came-of-age", f"Came of age at {age}", role="unemployed", idleMonths=0)
    if p.role == "worker" and age >= c["retireFrom"] and not p.retired:
        if rng.random() < c["retireChance"]:
            town.named[p.businessId] -= 1
            return note(p, m, "retired", f"Retired from {p.profession} work at {age}", related={"businessId": p.businessId},
                        role="retired", retired=True, businessId=None, profession=None)
        p = p.model_copy(update={"retired": True})
    if p.role == "trader" and p.traderId and not m.traders[p.traderId].active:
        # The economy already recorded the dismissal as an event; the person's cache just notes it.
        return note(p, m, "dismissed", "Let go as caravan master", emit=False, role="unemployed", traderId=None, profession=None,
                    idleMonths=0)
    if p.role == "outlaw":
        return _outlaw(p, town, m, rng)
    return _work(p, town, m, rng)


def people_month(cast: Cast, settlements: list[SettlementState], trade: Trade, *, day: int, seed: int,
                 rules: dict[str, Any]) -> tuple[Cast, Trade, list[dict[str, Any]]]:
    rates = rules["simulation"]["demography"]["deathRatePerYear"]
    m = Month(day, seed, rules["simulation"]["people"], rules["economy"],
              {"child": rates["children"], "adult": rates["adults"], "elder": rates["elders"]}, {t.id: t for t in trade.traders},
              rules["simulation"]["history"]["recentEvents"])
    towns = _towns(cast, settlements, trade.routes, rules["economy"]["famine"]["mortality"])
    people = [_live(p, towns[p.settlementId], m) if p.alive and p.settlementId in towns else p for p in cast.people]
    cast, trade = promote_traders(cast.model_copy(update={"people": people}), trade, settlements, m)
    return replace_dead(cast, settlements, m), trade, m.incidents
