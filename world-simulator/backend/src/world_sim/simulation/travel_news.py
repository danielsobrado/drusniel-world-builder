"""Attach locally available reports to departures and deliver them on the day of arrival."""

from .contracts import Journey, TravelState
from .economy.contracts import Caravan, Trade
from .history.contracts import HistoryEvent
from .people.contracts import Cast, Knowledge


def assign_carriers(trade: Trade, cast: Cast) -> Trade:
    holders = {p.traderId: p.id for p in cast.people if p.alive and p.traderId}
    convoys = [c.model_copy(update={"carrierId": holders[c.traderId]})
               if not c.carrierId and c.traderId in holders else c for c in trade.caravans]
    return trade.model_copy(update={"caravans": convoys}) if convoys != trade.caravans else trade


def remember(state: TravelState, events: list[HistoryEvent], minimum: int, keep: int) -> TravelState:
    if not events:
        return state
    news = dict(state.news)
    witnesses = dict(state.newsWitnesses)
    for e in events:
        if e.settlementId and e.visibility in ("public", "settlement") and e.importance >= minimum and e.source != "generated-prehistory":
            news[e.settlementId] = [*news.get(e.settlementId, []), e.id][-keep:]
            if e.participants:
                witnesses[e.id] = [p.personId for p in e.participants]
    return state.model_copy(update={"news": news, "newsWitnesses": witnesses}) if news != state.news else state


def propagate(state: TravelState, cast: Cast, trade: Trade, journeys: list[Journey], caravans: list[Caravan], *,
              day: int, cfg: dict, travel_cfg: dict) -> tuple[TravelState, Cast, Trade]:
    """Only people physically present at the receiving settlement can hear the reports."""
    news = dict(state.news)
    trade = assign_carriers(trade, cast)
    people = {p.id: p for p in cast.people}
    innkeepers: dict[str, list[str]] = {}
    for p in people.values():
        if p.alive and not p.journeyId and p.profession == "innkeeper":
            innkeepers.setdefault(p.settlementId, []).append(p.id)
    changed = set()
    delivered = [(j.originId if j.status == "returned" else j.destinationId, j.news, j.personIds[0] if j.personIds else None)
                 for j in journeys]
    for caravan in caravans:
        delivered.append((caravan.toId, caravan.news, caravan.carrierId))
        if caravan.carrierId and (p := people.get(caravan.carrierId)) and p.alive:
            visited = {**p.visited, caravan.toId: day}
            known = {k.eventId for k in p.knowledge}
            heard = [Knowledge(eventId=item, learnedDay=day, how="rumour", confidence=cfg["rumour"])
                     for item in news.get(caravan.toId, []) if item not in known and item not in caravan.news
                     and p.id not in state.newsWitnesses.get(item, [])]
            people[p.id] = p.model_copy(update={"visited": visited, "knowledge": [*p.knowledge, *heard][-cfg["maxEntries"]:]})
            changed.add(p.id)
    for town, reports, carrier in delivered:
        if not reports:
            continue
        known = news.get(town, [])
        fresh = [item for item in reports if item not in known]
        if not fresh:
            continue
        news[town] = [*known, *fresh][-travel_cfg["newsPerSettlement"]:]
        for pid in innkeepers.get(town, ()):
            if pid == carrier:
                continue
            p = people[pid]
            personal = {k.eventId for k in p.knowledge}
            additions = [Knowledge(eventId=item, learnedDay=day, how="rumour", fromId=carrier, confidence=cfg["rumour"])
                         for item in fresh if item not in personal and p.id not in state.newsWitnesses.get(item, [])]
            if additions:
                people[p.id] = p.model_copy(update={"knowledge": [*p.knowledge, *additions][-cfg["maxEntries"]:]})
                changed.add(p.id)
    limit = travel_cfg["newsPerTrip"]
    convoys = []
    for caravan in trade.caravans:
        if caravan.departDay == day:
            caravan = caravan.model_copy(update={"news": news.get(caravan.fromId, [])[-limit:]})
            if caravan.carrierId and (p := people.get(caravan.carrierId)) and p.alive:
                people[p.id] = p.model_copy(update={"visited": {**p.visited, caravan.fromId: day}})
                changed.add(p.id)
        convoys.append(caravan)
    traveling = [j.model_copy(update={"news": news.get(j.originId, [])[-limit:]}) if j.departDay == day else j
                 for j in state.journeys]
    still_traveling = {item for convoy in convoys for item in convoy.news}
    still_traveling |= {item for journey in traveling if journey.active for item in journey.news}
    retained = still_traveling | {item for items in news.values() for item in items}
    witnesses = {item: people for item, people in state.newsWitnesses.items() if item in retained}
    state = state.model_copy(update={"news": news, "journeys": traveling, "newsWitnesses": witnesses})
    return (state, cast.model_copy(update={"people": list(people.values())}) if changed else cast,
            trade.model_copy(update={"caravans": convoys}))
