"""
Turns a batch of incidents into canonical history and lets it touch the people: numbered
events, mechanical causes, recent caches, timelines, relationship origins, experience,
traders' character and second-hand knowledge. A month close and an intervention both
go through here, so an injected event has exactly the reach of a simulated one.
"""

from typing import Any

from ..economy.contracts import Trade
from ..people.contracts import Cast
from ..people.knowledge import spread
from ..people.outlook import apply_experience, in_character
from .causes import link_causes, stamp_cache
from .contracts import HistoryEvent
from .recorder import on_timelines, record, with_origins


def chronicle(incidents: list[dict[str, Any]], cast: Cast, trade: Trade, seq: int, day: int,
              rules: dict[str, Any], **record_options: str) -> tuple[Cast, Trade, list[HistoryEvent]]:
    history = rules["simulation"]["history"]
    events = [record(incident, seq + i, day, history, **record_options) for i, incident in enumerate(incidents)]
    events = link_causes(events, cast)
    cast = stamp_cache(cast, events, history["recentEvents"])
    cast = on_timelines(cast, events, history["timelineMinImportance"])
    cast = with_origins(cast, incidents, events)
    cast = apply_experience(cast, events, rules["simulation"]["people"]["experience"])
    trade = in_character(trade, cast)
    knowledge = rules["simulation"]["people"]["knowledge"]
    cast = spread(cast, events, day, knowledge, rules.get("peoples", {}).get("profiles", {}))
    return cast, trade, events
