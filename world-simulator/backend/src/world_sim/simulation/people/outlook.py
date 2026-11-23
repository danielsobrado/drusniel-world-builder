"""
A person's character beyond the three traits, and how experience changes them. The
profile (temperament, values) is drawn once from the traits; experiences recorded as
canonical events then nudge the traits by configured amounts, so a master robbed on the
road grows more cautious and an outlaw who served time grows more honest.
"""

import random
from typing import Any

from ..economy.contracts import Personality, Trade
from ..history.contracts import HistoryEvent
from .contracts import Cast, Profile

VALUES = ("duty", "family", "wealth", "faith", "knowledge")


def profile_for(p: Personality, rng: random.Random) -> Profile:
    temperament = "reserved" if p.caution > 0.6 else "assertive" if p.greed > 0.6 else "sociable"
    weights = {"duty": 0.3 + p.honesty, "family": 0.3 + p.caution, "wealth": 0.3 + p.greed, "faith": 0.5, "knowledge": 0.5}
    first = rng.choices(VALUES, weights=[weights[v] for v in VALUES])[0]
    second = rng.choices([v for v in VALUES if v != first], weights=[weights[v] for v in VALUES if v != first])[0]
    return Profile(temperament=temperament, values=[first, second])


def apply_experience(cast: Cast, events: list[HistoryEvent], cfg: dict[str, Any]) -> Cast:
    """Nudges the traits of everyone who took part in an event with a configured effect (by kind, then by role)."""
    deltas: dict[str, dict[str, float]] = {}
    for e in events:
        rules = cfg.get(e.kind) or {}
        for part in e.participants:
            change = rules.get(part.role) or rules.get("any")
            if change:
                mine = deltas.setdefault(part.personId, {})
                for trait, d in change.items():
                    mine[trait] = mine.get(trait, 0.0) + d
    if not deltas:
        return cast
    people = []
    for p in cast.people:
        if p.id in deltas:
            traits = {k: round(max(0.0, min(1.0, getattr(p.personality, k) + d)), 2) for k, d in deltas[p.id].items()}
            p = p.model_copy(update={"personality": p.personality.model_copy(update=traits)})
        people.append(p)
    return cast.model_copy(update={"people": people})


def in_character(trade: Trade, cast: Cast) -> Trade:
    """A master's trade record carries the person's current traits, which experience may have changed."""
    traits = {p.traderId: p.personality for p in cast.people if p.alive and p.traderId}
    if all(traits.get(t.id, t.personality) == t.personality for t in trade.traders):
        return trade
    return trade.model_copy(update={"traders": [t.model_copy(update={"personality": traits[t.id]}) if t.id in traits else t
                                                for t in trade.traders]})
