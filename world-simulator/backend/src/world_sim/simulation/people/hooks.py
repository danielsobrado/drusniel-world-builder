"""
What makes a person worth talking to right now, derived from their actual circumstances
and recent events, never stored: narrative hooks (conversation topics and future quest
seeds), plus the fears, ambitions, concerns and mood that follow from the same facts.
When circumstances change, these change with them.
"""

from typing import Any

from ..economy.contracts import Trade
from .contracts import Cast, Person
from .generate import age_years
from .relationships import Ties

RECENT = 360


def _recent(p: Person, kinds: set[str], day: int, within: int = RECENT) -> list[Any]:
    return [e for e in p.events if e.kind in kinds and day - e.day <= within]


def hooks(p: Person, cast: Cast, trade: Trade, settlement: Any, day: int) -> list[dict[str, str]]:
    ties = Ties(cast.relationships, cast.relSeq)
    people = {x.id: x for x in cast.people}
    family = {*ties.parents(p.id), *ties.children(p.id), *(x for x in [ties.spouse(p.id)] if x),
              *(ties.other(r, p.id) for r in ties.of(p.id, "sibling"))}
    trader = next((t for t in trade.traders if t.id == p.traderId), None)
    routes = {r.id: r for r in trade.routes}
    out: list[dict[str, str]] = []

    def add(kind: str, text: str, basis: str) -> None:
        out.append({"kind": kind, "text": text, "basis": basis})

    if p.role == "outlaw" and p.routeId in routes:
        add("outlaw", f"Lives outside the law on the road to {routes[p.routeId].centerName}", "role")
    if p.role == "unemployed" and age_years(p, day) >= 15:
        add("work", f"Looking for work, {p.idleMonths} months without it" if p.idleMonths else "Looking for work", "role")
    for x in sorted(family):
        relative = people.get(x)
        if relative and relative.alive and relative.role in ("outlaw", "imprisoned"):
            fate = "is in prison" if relative.role == "imprisoned" else "took to the road"
            add("family-trouble", f"Worried about {relative.name}, who {fate}", f"relative:{x}")
        if relative and relative.alive and relative.role == "trader":
            road = next((r for r in trade.routes if r.settlementId == relative.settlementId), None)
            if road and road.bandits:
                add("family-danger", f"Worried about {relative.name} on the road to {road.centerName}, where {road.bandits} bandits ride",
                    f"relative:{x}")
    grief = [e for e in cast.people if e.id in family and not e.alive and e.deathDay is not None and day - e.deathDay <= 2 * RECENT]
    for x in grief:
        add("grief", f"Mourning {x.name} {x.family}", f"relative:{x.id}")
    if _recent(p, {"married"}, day):
        spouse = people.get(ties.spouse(p.id) or "")
        if spouse:
            add("new-family", f"Newly married to {spouse.name}", "event")
    if _recent(p, {"moved", "promoted"}, day) and p.role != "child":
        add("newcomer", f"Making a new life in {settlement.name}", "event")
    mentor = next((r for r in ties.of(p.id, "mentor") if r.b == p.id), None)
    if mentor and mentor.a in people:
        add("apprentice", f"Learning the trade from {people[mentor.a].name}", "relationship")
    if trader:
        if trader.purse < 0:
            add("debt", f"Owes {-trader.purse:.0f} and is tempted by riskier dealings", "purse")
        if trader.scorecard.lossesValue and _recent(p, {"raid"}, day):
            add("loss", "Wants to recover what bandits took from the caravan", "event")
        if trader.owns:
            add("ambition", "Hoping to expand the businesses they funded", "ownership")
    if settlement.economy.food.security < 1:
        add("hunger", "Worried about food: the town is short of rations", "settlement")
    return out[:3]


def outlook(p: Person, cast: Cast, trade: Trade, settlement: Any, day: int, hooks_now: list[dict[str, str]]) -> dict[str, Any]:
    """Fears, ambitions, concerns and mood that follow from traits, profile and circumstances."""
    t = p.personality
    trader = next((x for x in trade.traders if x.id == p.traderId), None)
    fears = [f for f, on in (("poverty", t.greed > 0.6 or (trader and trader.purse < 0) or p.role == "unemployed"),
                             ("danger", t.caution > 0.6), ("losing family", bool(p.profile and "family" in p.profile.values)),
                             ("betrayal", any(r.kind == "rival" for r in Ties(cast.relationships, cast.relSeq).of(p.id)))) if on]
    ambitions = [a for a, on in (("own a shop", p.role == "worker" and t.greed > 0.5),
                                 ("leave town", p.role == "unemployed" and p.idleMonths > 6),
                                 ("become a master of the trade", any(h["kind"] == "apprentice" for h in hooks_now)),
                                 ("expand their businesses", bool(trader and trader.owns))) if on]
    recent = {e.kind for e in p.events if day - e.day <= 180}
    mood = ("grieving" if recent & {"died"} or any(h["kind"] == "grief" for h in hooks_now) else
            "anxious" if recent & {"lost-work", "raid", "caught", "smuggling"} else
            "hopeful" if recent & {"married", "born", "hired", "trader", "apprenticeship-started"} else "settled")
    return {"fears": fears, "ambitions": ambitions, "concerns": [h["text"] for h in hooks_now], "mood": mood}
