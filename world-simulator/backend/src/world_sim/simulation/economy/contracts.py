"""Economy state contracts (schema v3): settlement production and stock, markets, caravans."""

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
    produced: float = 0
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
    tradeBalance: float = 0          # last month: sales minus purchases


class MarketGood(Contract):
    basePrice: float = Field(gt=0)
    price: float = Field(gt=0)
    stock: float = Field(ge=0)
    outsideSupply: float = Field(ge=0)   # monthly, from Azgaar deals of members outside the scope
    outsideDemand: float = Field(ge=0)
    demand: float = 0                    # last month: requested by members and outside buyers
    supplied: float = 0                  # last month: delivered to the market
    left: float = 0                      # last month: stock above the cap that left the region


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


class Trade(Contract):
    markets: list[Market]
    caravans: list[Caravan]          # in transit
    delivered: list[Caravan]         # newest last, bounded by caravans.maxDelivered
    caravanSeq: int = 0
