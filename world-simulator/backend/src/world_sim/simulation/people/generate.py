"""
The cast at a scenario's start: as many named people per settlement as its NPC budget
allows, in households drawn from the settlement's own household mix, the caravan
masters first, adults working at its businesses in proportion to their staffing.
"""

import random
from collections import defaultdict
from typing import Any

from ...peoples.catalog import choose_ancestry, person_identity
from ...peoples.physiology import person_rules
from ...peoples.population import weights_for_band
from ...world.model import WorldModel
from ..economy.names import generator_for
from ..economy.roads import personality
from ..economy.sources import AzgaarEconomy
from .contracts import Cast, Dwelling, LifeEvent, NamePool, NpcHousehold, Person
from .homes import place
from .kinship import initial_ties
from .outlook import profile_for

# (adults, children, elders) per household kind; children are drawn from childrenPerFamily.
TEMPLATES = {
    "multigenerational": (2, True, 1), "couple-with-children": (2, True, 0), "single-parent": (1, True, 0),
    "couple": (2, False, 0), "single": (1, False, 0), "elder-couple": (0, False, 2), "elder-single": (0, False, 1),
}
def birth_day(rng: random.Random, band: str, cfg: dict[str, Any]) -> int:
    low, high, year = *cfg["ages"][band], cfg["daysPerYear"]
    return -(rng.randint(low, high) * year + rng.randint(0, year - 1))


def age_years(person: Person, day: int, cfg: dict[str, Any]) -> int:
    """Whole years of the scenario's calendar (`cfg` is the people rules, with `daysPerYear`)."""
    return (day - person.birthDay) // cfg["daysPerYear"]


def band_of(age: int, cfg: dict[str, Any]) -> str:
    return "child" if age < cfg["ages"]["adult"][0] else "adult" if age < cfg["ages"]["elder"][0] else "elder"


class CastBuilder:
    """Adds people and households for one settlement, keeping ids and the budget."""

    def __init__(self, settlement: Any, pool: NamePool, budget: int, rng: random.Random, cfg: dict[str, Any], seed: int):
        self.s, self.pool, self.budget, self.rng, self.cfg = settlement, pool, budget, rng, cfg
        self.seed = seed
        self.people: list[Person] = []
        self.households: list[NpcHousehold] = []
        self.dwellings: list[Dwelling] = []
        self.named: dict[str, int] = defaultdict(int)     # named workers per business

    def household(self, kind: str) -> NpcHousehold:
        hid = f"household:{self.s.sourceId}:{len(self.households) + 1}"
        home = place(self.dwellings, self.s, hid, self.rng)
        h = NpcHousehold(id=hid, settlementId=self.s.settlementId, family=self.rng.choice(self.pool.family), kind=kind,
                         housing=home.type, homeId=home.id)
        self.households.append(h)
        return h

    def person(self, h: NpcHousehold, band: str, sex: str, birth: int | None = None, **fields: Any) -> Person:
        fields.setdefault("role", "unemployed")
        pid = f"npc:{self.s.sourceId}:{len(self.people) + 1}"
        ancestry = choose_ancestry(weights_for_band(self.s.ancestries, band), self.seed, pid)
        cfg = person_rules(self.cfg, ancestry)
        ages = {**cfg["ages"], "adult": cfg["traderAges"]} if fields["role"] == "trader" else cfg["ages"]
        low, high = ages[band]
        year = cfg["daysPerYear"]
        born = (max(-(high + 1) * year + 1, min(-low * year, birth)) if birth is not None
                else birth_day(self.rng, band, {**cfg, "ages": ages}))
        p = Person(id=pid, name=fields.pop("name", None) or self.rng.choice(self.pool.given),
                   family=h.family, sex=sex, birthDay=born, settlementId=self.s.settlementId, birthplaceId=self.s.settlementId,
                   householdId=h.id, **person_identity(ancestry, self.s.identity, self.s.identity, self.s.settlementId, h.id),
                   personality=(traits := fields.pop("personality", None) or personality(self.rng)),
                   profile=profile_for(traits, self.rng),
                   events=[LifeEvent(day=0, kind="introduced", text=f"Lives in {self.s.name}")], **fields)
        p = self.occupy(p, band)
        self.people.append(p)
        return p

    def occupy(self, p: Person, band: str) -> Person:
        if p.role == "trader":
            return p
        if band == "child":
            return p.model_copy(update={"role": "child"})
        e = self.s.society.employment
        rate = e.employed / e.labourSupply if e.labourSupply else 0
        works = self.rng.random() < rate * (1 if band == "adult" else 0.25)
        open_posts = [b for b in self.s.society.businesses if b.filled > self.named[b.id]]
        if works and open_posts:
            b = self.rng.choices(open_posts, weights=[x.filled - self.named[x.id] for x in open_posts])[0]
            self.named[b.id] += 1
            return p.model_copy(update={"role": "worker", "businessId": b.id, "profession": b.profession})
        if band == "elder":
            return p.model_copy(update={"role": "retired", "retired": True})
        return p.model_copy(update={"role": "unemployed"})

    def room(self) -> int:
        return self.budget - len(self.people)

    def fill(self) -> None:
        groups = [g for g in self.s.society.households if g.kind in TEMPLATES and g.households]
        while self.room() > 0 and groups:
            kind = self.rng.choices([g.kind for g in groups], weights=[g.households for g in groups])[0]
            adults, has_children, elders = TEMPLATES[kind]
            children = self.rng.randint(*self.cfg["childrenPerFamily"]) if has_children else 0
            h = self.household(kind)
            first = self.rng.choice(("female", "male"))
            other = "male" if first == "female" else "female"
            grown: list[Person] = []
            for i, band in enumerate(["adult"] * adults + ["elder"] * elders):
                if self.room() <= 0:
                    break
                # A partner is within a few years of the first adult; an elder in a family household is a generation older.
                birth = None if not grown else self.partner_birth(grown[0].birthDay, band)
                grown.append(self.person(h, band, first if i == 0 else other, birth))
            for birth in self.child_births(grown, children):
                if self.room() <= 0:
                    break
                self.person(h, "child", self.rng.choice(("female", "male")), birth)

    def partner_birth(self, first: int, band: str) -> int:
        low, high = self.cfg["ages"][band]
        year = self.cfg["daysPerYear"]
        age = (0 - first) // year + self.rng.randint(-self.cfg["partnerAgeGap"], self.cfg["partnerAgeGap"])
        return -(max(low, min(high, age)) * year + self.rng.randint(0, year - 1))

    def child_births(self, grown: list[Person], count: int) -> list[int]:
        """Children born after the youngest parent was old enough, and young enough to still be children now."""
        parents = [p for p in grown if age_years(p, 0, self.cfg) < self.cfg["ages"]["elder"][0]] or grown
        if not parents or not count:
            return []
        year = self.cfg["daysPerYear"]
        earliest = max(max(p.birthDay for p in parents) + self.cfg["parentMinAge"] * year, -(self.cfg["ages"]["child"][1] + 1) * year + 1)
        if earliest > 0:
            return []
        return sorted(self.rng.randint(earliest, 0) for _ in range(count))


def initial_cast(model: WorldModel, settlements: list[Any], traders: list[Any], seed: int, cfg: dict[str, Any]) -> Cast:
    az = AzgaarEconomy(model)
    people, households, dwellings, names, seq, budget = [], [], [], {}, {}, {}
    active_traders: dict[str, list[Any]] = {}
    for trader in traders:
        if trader.active:
            active_traders.setdefault(trader.settlementId, []).append(trader)
    for s in settlements:
        rng = random.Random(f"{seed}:people:{s.settlementId}")
        gen = generator_for(model.document, az.culture_of(s.sourceId))
        limit = cfg["namePool"]["maxLength"]
        pool = NamePool(given=[gen.name(rng, limit) for _ in range(cfg["namePool"]["given"])],
                        family=[gen.name(rng, limit) for _ in range(cfg["namePool"]["family"])])
        b = CastBuilder(s, pool, model.npcs_by_id.get(s.settlementId, 0), rng, cfg, seed)
        for t in active_traders.get(s.settlementId, []):
            if b.room() <= 0:
                break
            h = b.household("couple" if t.household.adults == 2 else "single")
            sex = rng.choice(("female", "male"))
            master = b.person(h, "adult", sex, name=t.name, personality=t.personality, role="trader", traderId=t.id,
                              profession="caravan master")
            b.people[-1] = master.model_copy(update={"events": [*master.events, LifeEvent(
                day=0, kind="trader", text=f"Caravan master on the road from {s.name}")]})
            if t.household.adults == 2 and b.room() > 0:
                b.person(h, "adult", "male" if sex == "female" else "female", b.partner_birth(master.birthDay, "adult"))
        b.fill()
        people += b.people
        households += b.households
        dwellings += b.dwellings
        names[s.settlementId], seq[s.settlementId], budget[s.settlementId] = pool, len(b.people), b.budget
    people, places = origins(model, people, seed, cfg)
    ties = initial_ties(people, {h.id: h.kind for h in households}, traders, seed, cfg)
    return Cast(people=people, households=households, dwellings=dwellings, names=names, seq=seq, budget=budget, places=places,
                relationships=ties.items, relSeq=ties.seq)


def origins(model: WorldModel, people: list[Person], seed: int, cfg: dict[str, Any]) -> tuple[list[Person], dict[str, str]]:
    """Some adults were born elsewhere: in one of the nearest settlements of the same culture on the map."""
    towns = model.audit["settlements"]
    rng = random.Random(f"{seed}:origins")
    places: dict[str, str] = {}
    out = []
    candidates: dict[str, list[dict[str, Any]]] = {}
    for p in people:
        here = model.settlements_by_id[p.settlementId]
        if p.role != "child" and rng.random() >= cfg["originLocalShare"]:
            if p.settlementId not in candidates:
                others = [t for t in towns if t["id"] != here["id"]]
                kin = [t for t in others if t["cultureId"] == here["cultureId"]] or others
                candidates[p.settlementId] = sorted(
                    kin, key=lambda t: ((t["x"] - here["x"]) ** 2 + (t["y"] - here["y"]) ** 2,
                                        t["sourceId"]))[:cfg["originCandidates"]]
            birthplace = rng.choice(candidates[p.settlementId])
            places[birthplace["id"]] = birthplace["name"]
            p = p.model_copy(update={"birthplaceId": birthplace["id"]})
        out.append(p)
    return out, places
