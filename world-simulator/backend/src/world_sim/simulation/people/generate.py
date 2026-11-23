"""
The cast at a scenario's start: as many named people per settlement as its NPC budget
allows, in households drawn from the settlement's own household mix, the caravan
masters first, adults working at its businesses in proportion to their staffing.
"""

import random
from collections import defaultdict
from typing import Any

from ...world.model import WorldModel
from ..economy.names import generator_for
from ..economy.roads import personality
from ..economy.sources import AzgaarEconomy
from .contracts import Cast, Dwelling, LifeEvent, NamePool, NpcHousehold, Person
from .homes import place

# (adults, children, elders) per household kind; children are drawn from childrenPerFamily.
TEMPLATES = {
    "multigenerational": (2, True, 1), "couple-with-children": (2, True, 0), "single-parent": (1, True, 0),
    "couple": (2, False, 0), "single": (1, False, 0), "elder-couple": (0, False, 2), "elder-single": (0, False, 1),
}
YEAR = 360


def birth_day(rng: random.Random, band: str, ages: dict[str, list[int]]) -> int:
    low, high = ages[band]
    return -(rng.randint(low, high) * YEAR + rng.randint(0, YEAR - 1))


def age_years(person: Person, day: int) -> int:
    return (day - person.birthDay) // YEAR


def band_of(age: int, cfg: dict[str, Any]) -> str:
    return "child" if age < cfg["ages"]["adult"][0] else "adult" if age < cfg["ages"]["elder"][0] else "elder"


class CastBuilder:
    """Adds people and households for one settlement, keeping ids and the budget."""

    def __init__(self, settlement: Any, pool: NamePool, budget: int, rng: random.Random, cfg: dict[str, Any]):
        self.s, self.pool, self.budget, self.rng, self.cfg = settlement, pool, budget, rng, cfg
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

    def person(self, h: NpcHousehold, band: str, sex: str, **fields: Any) -> Person:
        fields.setdefault("role", "unemployed")
        ages = {**self.cfg["ages"], "adult": self.cfg["traderAges"]} if fields["role"] == "trader" else self.cfg["ages"]
        p = Person(id=f"npc:{self.s.sourceId}:{len(self.people) + 1}", name=fields.pop("name", None) or self.rng.choice(self.pool.given),
                   family=h.family, sex=sex, birthDay=birth_day(self.rng, band, ages), settlementId=self.s.settlementId,
                   householdId=h.id, personality=fields.pop("personality", None) or personality(self.rng),
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
            for i, band in enumerate(["adult"] * adults + ["elder"] * elders + ["child"] * children):
                if self.room() <= 0:
                    break
                other = "male" if first == "female" else "female"
                sex = first if i == 0 else other if band != "child" and i == 1 else self.rng.choice(("female", "male"))
                self.person(h, band, sex)


def initial_cast(model: WorldModel, settlements: list[Any], traders: list[Any], seed: int, cfg: dict[str, Any]) -> Cast:
    az = AzgaarEconomy(model)
    people, households, dwellings, names, seq, budget = [], [], [], {}, {}, {}
    for s in settlements:
        rng = random.Random(f"{seed}:people:{s.settlementId}")
        gen = generator_for(model.document, az.culture_of(s.sourceId))
        limit = cfg["namePool"]["maxLength"]
        pool = NamePool(given=[gen.name(rng, limit) for _ in range(cfg["namePool"]["given"])],
                        family=[gen.name(rng, limit) for _ in range(cfg["namePool"]["family"])])
        b = CastBuilder(s, pool, model.npcs_by_id.get(s.settlementId, 0), rng, cfg)
        for t in (t for t in traders if t.settlementId == s.settlementId and t.active):
            if b.room() <= 0:
                break
            h = b.household("couple" if t.household.adults == 2 else "single")
            sex = rng.choice(("female", "male"))
            master = b.person(h, "adult", sex, name=t.name, personality=t.personality, role="trader", traderId=t.id,
                              profession="caravan master")
            b.people[-1] = master.model_copy(update={"events": [*master.events, LifeEvent(
                day=0, kind="trader", text=f"Caravan master on the road from {s.name}")]})
            if t.household.adults == 2 and b.room() > 0:
                b.person(h, "adult", "male" if sex == "female" else "female")
        b.fill()
        people += b.people
        households += b.households
        dwellings += b.dwellings
        names[s.settlementId], seq[s.settlementId], budget[s.settlementId] = pool, len(b.people), b.budget
    return Cast(people=people, households=households, dwellings=dwellings, names=names, seq=seq, budget=budget)
