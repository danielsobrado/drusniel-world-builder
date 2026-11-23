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
from .contracts import Cast, LifeEvent, Person
from .generate import age_years, band_of
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
    incidents: list[dict[str, Any]] = field(default_factory=list)


def note(p: Person, day: int, kind: str, text: str, cfg: dict[str, Any], **update: Any) -> Person:
    events = [*p.events, LifeEvent(day=day, kind=kind, text=text)][-cfg["maxEvents"]:]
    return p.model_copy(update={**update, "events": events})


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
            return note(p, m.day, "lost-work", f"Lost work: {what}", c, role="unemployed", businessId=None, profession=None, idleMonths=0)
        if rng.random() < c["loseWorkPerMonth"] * town.unemployment:
            town.named[p.businessId] -= 1
            return note(p, m.day, "lost-work", f"Let go by {business.name}", c, role="unemployed", businessId=None, profession=None,
                        idleMonths=0)
        return p
    if p.role != "unemployed":
        return p
    p = p.model_copy(update={"idleMonths": p.idleMonths + 1})
    if rng.random() < c["findWorkPerMonth"] * (1 - town.unemployment):
        posts = [b for b in town.businesses.values() if b.filled > town.named[b.id]]
        if posts:
            b = rng.choices(posts, weights=[x.filled - town.named[x.id] for x in posts])[0]
            town.named[b.id] += 1
            return note(p, m.day, "hired", f"Hired as {b.profession} at {b.name}", c, role="worker", businessId=b.id,
                        profession=b.profession, idleMonths=0)
    o, t = c["outlaw"], p.personality
    if (town.route and p.idleMonths >= o["idleMonths"] and t.honesty <= o["maxHonesty"] and t.greed >= o["minGreed"]
            and rng.random() < o["chance"]):
        town.outlaws += 1
        way = "sea lane" if town.route.mode == "sea" else "road"
        m.incidents.append({"kind": "outlaw", "message": f"{p.name} {p.family} of {town.settlement.name} took to the {way} to "
                            f"{town.route.centerName} after {p.idleMonths} months without work", "person": p.id})
        return note(p, m.day, "outlaw", f"Took to the {way} with the {'pirates' if way == 'sea lane' else 'bandits'}", c,
                    role="outlaw", routeId=town.route.id)
    return p


def _outlaw(p: Person, town: Town, m: Month, rng: random.Random) -> Person:
    c, route = m.cfg, town.route
    if route is None or route.id != p.routeId or route.bandits < town.outlaws:
        town.outlaws -= 1
        return note(p, m.day, "came-home", "Came home when the band broke up", c, role="unemployed", routeId=None, idleMonths=0)
    caught = route.removed / max(1, route.bandits + route.removed)
    if rng.random() < caught:
        town.outlaws -= 1
        m.incidents.append({"kind": "caught", "message": f"{p.name} {p.family}, outlaw on the {town.settlement.name} road, was caught "
                            f"and imprisoned", "person": p.id})
        return note(p, m.day, "caught", "Caught by a patrol and imprisoned", c, role="imprisoned", routeId=None,
                    releaseDay=m.day + c["prisonDays"])
    if rng.random() < c["outlaw"]["giveUpPerMonth"]:
        town.outlaws -= 1
        return note(p, m.day, "came-home", "Gave up the outlaw's life and came home", c, role="unemployed", routeId=None, idleMonths=0)
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
        cause = "hunger and age" if town.mortality > 1.05 else "on the road" if p.role == "outlaw" else "illness or age"
        return note(p, m.day, "died", f"Died at {age} ({cause})", c, alive=False, deathDay=m.day, cause=cause)
    if p.role == "imprisoned" and m.day >= (p.releaseDay or 0):
        return note(p, m.day, "released", "Released from prison", c, role="unemployed", releaseDay=None, idleMonths=0)
    if p.role == "child" and age >= c["ages"]["adult"][0]:
        return note(p, m.day, "came-of-age", f"Came of age at {age}", c, role="unemployed", idleMonths=0)
    if p.role == "worker" and age >= c["retireFrom"] and not p.retired:
        if rng.random() < c["retireChance"]:
            town.named[p.businessId] -= 1
            return note(p, m.day, "retired", f"Retired from {p.profession} work at {age}", c, role="retired", retired=True,
                        businessId=None, profession=None)
        p = p.model_copy(update={"retired": True})
    if p.role == "trader" and p.traderId and not m.traders[p.traderId].active:
        return note(p, m.day, "dismissed", "Let go as caravan master", c, role="unemployed", traderId=None, profession=None, idleMonths=0)
    if p.role == "outlaw":
        return _outlaw(p, town, m, rng)
    return _work(p, town, m, rng)


def people_month(cast: Cast, settlements: list[SettlementState], trade: Trade, *, day: int, seed: int,
                 rules: dict[str, Any]) -> tuple[Cast, Trade, list[dict[str, Any]]]:
    rates = rules["simulation"]["demography"]["deathRatePerYear"]
    m = Month(day, seed, rules["simulation"]["people"], rules["economy"],
              {"child": rates["children"], "adult": rates["adults"], "elder": rates["elders"]}, {t.id: t for t in trade.traders})
    towns = _towns(cast, settlements, trade.routes, rules["economy"]["famine"]["mortality"])
    people = [_live(p, towns[p.settlementId], m) if p.alive and p.settlementId in towns else p for p in cast.people]
    cast, trade = promote_traders(cast.model_copy(update={"people": people}), trade, settlements, m)
    return replace_dead(cast, settlements, m), trade, m.incidents
