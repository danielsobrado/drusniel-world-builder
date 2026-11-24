"""Economy state contracts (schema v4): production and stock, markets, caravans, roads, bandits and traders."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Contract(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ProductionLine(Contract):
    """One Azgaar production entry: `units` a month at full staffing, `inputs` per month at that rate."""
    good: str
    source: Literal["workshop", "extraction", "hinterland"]
    units: float = Field(ge=0)
    inputs: dict[str, float] = {}
    produced: float = 0.0
    limitedBy: str | None = None     # "staff", an input good, or None at full output


class Shortage(Contract):
    good: str
    wanted: float
    obtained: float


class FoodBalance(Contract):
    ruralPopulation: int = Field(ge=0)   # hinterland inhabitants (from the map, not simulated)
    hinterlandCells: int = Field(ge=0)
    local: int = 0           # rations grown by the settlement's own agriculture last month
    hinterland: int = 0      # rations sent in by the hinterland last month
    eaten: int = 0
    wanted: int = 0
    security: float = 1.0    # eaten / wanted last month; drives famine mortality
    selfSufficiency: float = 1.0   # (local + hinterland) / wanted


class SettlementEconomy(Contract):
    marketId: int | None
    settlementClass: str = ""        # the imported class, which sets the sector shares new businesses aim for
    travelDays: int = Field(ge=0)    # caravan days to the market centre
    baselinePopulation: int
    inventory: dict[str, float]
    production: list[ProductionLine]
    consumption: dict[str, float]    # monthly at the baseline population, from Azgaar deals
    bought: dict[str, float] = {}    # last month
    sold: dict[str, float] = {}
    shortages: list[Shortage] = []
    food: FoodBalance
    treasury: float                  # starts at the Azgaar burg treasury
    tradeBalance: float = 0.0          # last month: sales minus purchases, tax, escorts, confiscations and losses
    taxPaid: float = 0.0               # last month
    escortCost: float = 0.0            # last month
    lostToBandits: float = 0.0         # last month, value of cargo taken on the road
    businessSeq: int = 0             # businesses opened during the run, for their ids
    opened: int = 0                  # cumulative
    closed: int = 0


class MarketGood(Contract):
    basePrice: float = Field(gt=0)
    price: float = Field(gt=0)
    stock: float = Field(ge=0)
    outsideSupply: float = Field(ge=0)   # monthly, from Azgaar deals of members outside the scope
    outsideDemand: float = Field(ge=0)
    demand: float = 0.0                    # last month: requested by members and outside buyers
    supplied: float = 0.0                  # last month: delivered to the market
    left: float = 0.0                      # last month: stock above the cap that left the region


class PricePoint(Contract):
    day: int
    prices: dict[str, float]


class Market(Contract):
    marketId: int
    centerSettlementId: str
    centerName: str
    centerInScope: bool
    goods: dict[str, MarketGood]
    priceHistory: list[PricePoint]
    taxRates: dict[str, float] = {}      # share of a sale's value, from Azgaar's taxed deals
    taxRevenue: float = 0.0                # last month


class Caravan(Contract):
    id: str
    kind: Literal["sale", "purchase"]
    marketId: int
    fromId: str
    fromName: str
    toId: str
    toName: str
    cargo: dict[str, float]
    value: float
    departDay: int
    arriveDay: int
    routeId: str | None = None
    traderId: str | None = None
    traderName: str | None = None
    guards: int = 0
    lost: dict[str, float] = {}      # taken by bandits on the road
    smuggled: float = 0.0              # value hidden from the market tax
    caught: bool = False             # smuggled goods confiscated at the gate
    news: list[str] = []             # events from home the master carries as rumour, told on arrival (v7)


class Route(Contract):
    """The road, or sea lane, between a settlement and its market centre, and the bandits or pirates who work it."""
    id: str
    mode: Literal["land", "sea"] = "land"
    settlementId: str
    settlementName: str
    marketId: int
    centerName: str
    days: int
    bandits: int = Field(ge=0)
    floor: int = Field(ge=0)          # a band founded by an Azgaar brigands marker never shrinks below this
    lair: str | None = None           # that marker's name
    raidChance: float = 0.0             # chance an unguarded caravan is raided, at the current band size
    guardsWanted: int = 0             # last month: the escort its trader asked for
    recruits: int = 0                 # last month
    removed: int = 0                  # last month: caught by patrols or drifted away
    loot: dict[str, float] = {}       # taken last month, fenced to the market next month
    raids: int = 0                    # cumulative
    lootValue: float = 0.0              # cumulative
    reserve: list[str] = []           # names, from the home culture, for traders hired to replace dismissed ones


class Personality(Contract):
    greed: float = Field(ge=0, le=1)
    caution: float = Field(ge=0, le=1)
    honesty: float = Field(ge=0, le=1)


class Scorecard(Contract):
    trips: int = 0
    valueCarried: float = 0.0
    commission: float = 0.0
    taxPaid: float = 0.0
    taxEvaded: float = 0.0
    smuggled: int = 0                 # trips with hidden cargo
    caught: int = 0
    fines: float = 0.0
    raids: int = 0
    lossesValue: float = 0.0
    guardsHired: int = 0
    reputation: float = Field(50.0, ge=0, le=100)
    livingCosts: float = 0.0
    dividends: float = 0.0
    invested: float = 0.0


class Household(Contract):
    adults: int = Field(ge=1)
    children: int = Field(ge=0)


class Trader(Contract):
    """A caravan master: a persistent character whose personality drives escorts and smuggling."""
    id: str
    name: str
    settlementId: str
    settlementName: str
    routeId: str
    personality: Personality
    scorecard: Scorecard = Scorecard()
    household: Household = Household(adults=1, children=0)
    purse: float = 0.0                 # savings; below zero is debt, which pushes towards smuggling
    owns: list[str] = []               # businesses they funded
    busyUntil: int = 0
    active: bool = True
    dismissedDay: int | None = None


class Trade(Contract):
    markets: list[Market]
    caravans: list[Caravan]          # in transit
    delivered: list[Caravan]         # newest last, bounded by caravans.maxDelivered
    caravanSeq: int = 0
    routes: list[Route] = []
    traders: list[Trader] = []
    traderSeq: int = 0
