"""Daily journeys, exclusive population ownership and destination reservations."""

import math
import random
from collections import Counter
from dataclasses import dataclass, field

from ..geography.paths import TravelPath
from ..peoples.catalog import NEUTRAL
from ..peoples.population import combined, transfer
from .contracts import Cohorts, Journey, SettlementState, TravelIncident, TravelState
from .economy.contracts import Trade
from .economy.step import with_food_need
from .people.contracts import Cast
from .people.journeys import embark, settle
from .society import update_society
from .travel_conditions import route_delay

EMPTY = Cohorts(adults=0, children=0, elders=0)


def _groups(town: SettlementState) -> dict[str, Cohorts]:
    return town.ancestries or {NEUTRAL: town.cohorts}


def _vacant(town: SettlementState) -> int:
    return sum(h.vacant for h in town.society.housing)


def _risk(route: TravelPath, trade: Trade) -> int:
    roads = set(route.sourceRouteIds)
    return max((r.bandits for r in trade.routes if r.path and roads.intersection(r.path.sourceRouteIds)), default=0)


def _wage(town: SettlementState) -> float:
    return town.society.employment.wageBillPerMonth / max(1, town.society.employment.employed)


def _idle(town: SettlementState) -> float:
    jobs = town.society.employment
    return jobs.unemployed / max(1, jobs.labourSupply)


def _benefit(origin: SettlementState, destination: SettlementState, route: TravelPath, bandits: int) -> float:
    local = origin.identity.cultureId or origin.identity.cultureSeedId
    foreign = destination.identity.cultureId or destination.identity.cultureSeedId
    culture = 0.05 if local and local == foreign else 0
    wage = (_wage(destination) - _wage(origin)) / max(1, _wage(origin))
    vacancy = _vacant(destination) / max(1, sum(h.capacity for h in destination.society.housing))
    safety = {t.settlementId: next((n.value for n in t.society.needs if n.id == "safety"), 1.0) for t in (origin, destination)}
    return (_idle(origin) - _idle(destination) + 0.2 * wage + 0.45 * vacancy + culture
            + 0.1 * (safety[destination.settlementId] - safety[origin.settlementId])
            - route.days / 250 - min(0.4, bandits * 0.003))


def _incident(journey: Journey, day: int, kind: str, settlement: str, **facts) -> dict:
    label = {"departed": "left for", "moved": "arrived from", "migration-arrived": "arrived from",
             "travel-delayed": "was delayed en route to", "travel-returning": "turned back from",
             "travel-returned": "returned from"}[kind]
    other = facts.pop("other")
    headcount = len(journey.personIds) if kind in ("moved", "travel-returned") and journey.personIds else journey.population
    message = f"{headcount} {'traveler' if headcount == 1 else 'travelers'} {label} {other}"
    return {"kind": kind, "day": day, "precision": "day", "message": message,
            "settlementId": settlement, "routeId": journey.routeId,
            "householdId": facts.pop("householdId", None),
            "participants": [{"personId": pid, "role": "traveler"} for pid in journey.personIds],
            "relatedEntities": [journey.id, journey.originId, journey.destinationId],
            "facts": {"journeyId": journey.id, "from": journey.originId, "to": journey.destinationId, **facts}}


@dataclass
class TravelDay:
    """Working copy for a single day's migration changes."""

    state: TravelState
    settlements: list[SettlementState]
    cast: Cast
    trade: Trade
    rules: dict
    seed: int
    day: int
    incidents: list[dict] = field(default_factory=list)
    arrivals: list[Journey] = field(default_factory=list)

    def __post_init__(self):
        self.towns = {s.settlementId: s for s in self.settlements}
        self.routes = {r.id: r for r in self.state.routes}

    def _change(self, town: SettlementState, groups: dict[str, Cohorts], *, arrivals: int = 0, departures: int = 0) -> SettlementState:
        cohorts = combined(groups)
        society = update_society(town.society, cohorts, self.rules["society"], self.rules["simulation"]["calendar"]["daysPerMonth"])
        society = with_food_need(society, town.economy, self.rules)
        vitals = town.vitals.model_copy(update={"immigrants": town.vitals.immigrants + arrivals,
                                              "emigrants": town.vitals.emigrants + departures})
        updated = town.model_copy(update={"ancestries": groups, "cohorts": cohorts, "population": cohorts.total, "society": society,
                                          "immigrants": town.immigrants + arrivals, "emigrants": town.emigrants + departures,
                                          "vitals": vitals})
        self.towns[town.settlementId] = updated
        return updated

    def _event(self, journey: Journey, kind: str, town: SettlementState, other: SettlementState, **facts) -> None:
        head = set(journey.personIds)
        households = [p.householdId for p in self.cast.people if p.id in head]
        house = households[0] if households and len(set(households)) == 1 else None
        self.incidents.append(_incident(journey, self.day, kind, town.settlementId, other=other.name, householdId=house, **facts))

    def _disruption(self, journey: Journey, route: TravelPath) -> Journey:
        if journey.incidents or self.day != journey.departDay + max(1, route.days // 2):
            return journey
        cfg = self.rules["simulation"]["travel"]
        disruption = route_delay(route, self.seed, self.day, cfg)
        if disruption:
            kind, delay = disruption
        else:
            risk = min(1.0, _risk(route, self.trade) * cfg["banditChancePerBandit"])
            if random.Random(f"{self.seed}:{journey.id}:bandits").random() >= risk:
                return journey
            kind, delay = "bandits", cfg["delays"]["bandits"]
        self._event(journey, "travel-delayed", self.towns[journey.originId], self.towns[journey.destinationId], cause=kind, delayDays=delay)
        return journey.model_copy(update={"status": "delayed", "arriveDay": journey.arriveDay + delay,
                                         "incidents": [TravelIncident(day=self.day, kind=kind, delayDays=delay)]})

    def tick(self) -> None:
        if not any(j.active for j in self.state.journeys):
            return
        updated = []
        for journey in self.state.journeys:
            if journey.active:
                journey = self._tick(journey)
            updated.append(journey)
        limit = self.rules["simulation"]["travel"]["maxCompleted"]
        recent = sorted((j for j in updated if not j.active), key=lambda j: (j.arriveDay, j.id))[-limit:]
        self.state = self.state.model_copy(update={"journeys": [*(j for j in updated if j.active), *recent]})

    def _tick(self, journey: Journey) -> Journey:
        route = self.routes[journey.routeId]
        if journey.status == "departing":
            journey = journey.model_copy(update={"status": "traveling"})
        returning = journey.status == "returning"
        if journey.status == "delayed" and self.day >= journey.incidents[-1].day + journey.incidents[-1].delayDays:
            journey = journey.model_copy(update={"status": "traveling"})
        if not returning:
            journey = self._disruption(journey, route)
        if self.day < journey.arriveDay:
            return journey

        origin, destination = self.towns[journey.originId], self.towns[journey.destinationId]
        if not returning and _vacant(destination) < journey.householdSlots:
            self._event(journey, "travel-returning", origin, destination, cause="destination-full")
            return journey.model_copy(update={"status": "returning", "arriveDay": self.day + route.days, "incidents": [
                *journey.incidents, TravelIncident(day=self.day, kind="destination-full", delayDays=route.days)]})

        town = origin if returning else destination
        groups = _groups(town)
        for key, cohort in journey.ancestries.items():
            existing = groups.get(key, EMPTY)
            groups = {**groups, key: Cohorts(adults=existing.adults + cohort.adults, children=existing.children + cohort.children,
                                              elders=existing.elders + cohort.elders)}
        town = self._change(town, groups, arrivals=journey.population)
        self.cast = settle(self.cast, journey, town, self.seed)
        kind = "travel-returned" if returning else "moved" if journey.personIds else "migration-arrived"
        other = destination if returning else origin
        if journey.personIds:
            travelers = set(journey.personIds)
            households = {}
            for person in self.cast.people:
                if person.id in travelers:
                    households.setdefault(person.householdId, []).append(person.id)
            for members in households.values():
                self._event(journey.model_copy(update={"personIds": members}), kind, town, other)
        else:
            self._event(journey, kind, town, other)
        complete = journey.model_copy(update={"status": "returned" if returning else "arrived"})
        self.arrivals.append(complete)
        return complete

    def dispatch(self) -> None:
        cfg = self.rules["simulation"]["migration"]
        if not self.routes:
            return
        planned = []
        booked = {c.carrierId for c in self.trade.caravans if c.carrierId}
        sequence = self.state.sequence
        slots: Counter = Counter()  # reservations include parties that may have to return
        named = Counter()
        reserved_population = Counter()
        for j in self.state.journeys:
            if j.active:
                for sid in (j.originId, j.destinationId):
                    slots[sid] += j.householdSlots
                named[j.destinationId] += len(j.personIds)
                reserved_population[j.destinationId] += j.population
        connections = {}
        for route in self.routes.values():
            bandits = _risk(route, self.trade)
            connections.setdefault(route.fromId, []).append((route, bandits))
            connections.setdefault(route.toId, []).append((route.reverse(), bandits))
        for sid in sorted(connections):
            origin = self.towns[sid]
            idle = origin.society.employment.unemployed
            adults = min(origin.cohorts.adults, int(idle * cfg["shareOfIdlePerMonth"]))
            if adults <= 0:
                continue
            choices = []
            for route, bandits in connections[sid]:
                other = self.towns[route.toId]
                if _idle(origin) < _idle(other) + cfg["minRateGap"]:
                    continue
                benefit = _benefit(origin, other, route, bandits)
                room = max(0, math.floor(_vacant(other) * cfg["vacantHousingShare"]) - slots[other.settlementId])
                if benefit >= cfg["minBenefit"] and room:
                    choices.append((benefit, other.settlementId, route, room, bandits))
            if not choices:
                continue
            _, target, route, room, bandits = min(choices, key=lambda choice: (-choice[0], choice[1]))
            destination = self.towns[target]
            cap = int(destination.population * cfg["settlementSharePerMonth"]) - reserved_population[target]
            capacity = min(room * cfg["householdSize"], max(0, cap))
            ratio = origin.cohorts.children / max(1, origin.cohorts.adults)
            adults = min(adults, int(capacity / (1 + ratio)))
            children = min(origin.cohorts.children, capacity - adults, round(adults * ratio))
            if adults <= 0:
                continue
            remaining, _, group = transfer(_groups(origin), {}, adults, children)
            sequence += 1
            journey = Journey(id=f"journey:{sequence}", routeId=route.id, originId=sid, destinationId=target, reason="work and housing",
                              departDay=self.day, arriveDay=self.day + route.days, ancestries=group,
                              householdSlots=math.ceil((adults + children) / cfg["householdSize"]))
            self.cast, people = embark(self.cast, journey, origin, destination, seed=self.seed, cfg=self.rules["simulation"]["people"],
                                      reserved=named[target], distance_days=route.days, risk=min(0.4, bandits * 0.003), booked=booked)
            journey = journey.model_copy(update={"personIds": people})
            self._change(origin, remaining, departures=journey.population)
            self._event(journey, "departed", origin, destination, expectedArrival=journey.arriveDay)
            planned.append(journey)
            slots[target] += journey.householdSlots
            slots[sid] += journey.householdSlots
            named[target] += len(people)
            reserved_population[target] += journey.population
        if planned:
            self.state = self.state.model_copy(update={"journeys": [*self.state.journeys, *planned], "sequence": sequence})

    def result(self) -> list[SettlementState]:
        return list(self.towns.values())



def check_travel(travel: TravelState, settlements: list[SettlementState], cast: Cast, day: int) -> list[str]:
    departure_balance = sum(t.emigrants - t.immigrants for t in settlements)
    problems = []
    if departure_balance != travel.population:
        problems.append(f"{departure_balance} net departures but {travel.population} people in transit")
    manifests = {}
    route_ids = {r.id for r in travel.routes}
    active = [j for j in travel.journeys if j.active]
    for party in active:
        if party.routeId not in route_ids or not party.departDay <= day < party.arriveDay:
            problems.append(f"{party.id} has an invalid route or date")
        if len(party.personIds) > party.population:
            problems.append(f"{party.id} has more named travelers than people")
        for pid in party.personIds:
            if pid in manifests:
                problems.append(f"{pid} has more than one active journey")
            manifests[pid] = party.id
    people = {p.id: p.journeyId for p in cast.people if p.alive and p.journeyId}
    if people != manifests:
        problems.append("named travelers do not match the active journey manifests")
    return problems
