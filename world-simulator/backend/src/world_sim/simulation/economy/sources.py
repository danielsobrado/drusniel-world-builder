"""
A settlement's economy as the Azgaar map records it: production lines with their
recipes, what it buys for its own use, its market, and the outside trade of market
members beyond the scenario's scope. Read once at baseline (or on migration).
"""

from collections import defaultdict
from typing import Any

from ...world.model import WorldModel
from ..contracts import Business
from .contracts import ProductionLine

EXTRACTION_SECTORS = {"agriculture", "extraction"}


class AzgaarEconomy:
    def __init__(self, model: WorldModel):
        pack = model.document["pack"]
        self.goods = {g["i"]: g for g in pack.get("goods") or [] if isinstance(g, dict)}
        self.burgs = {b["i"]: b for b in pack["burgs"] if isinstance(b, dict) and b.get("i")}
        self.markets = {m["i"]: m for m in pack.get("markets") or [] if isinstance(m, dict)}
        self.deals = [d for d in pack.get("deals") or [] if isinstance(d, dict) and d.get("good") in self.goods]
        self.good_ids = {g["name"]: i for i, g in self.goods.items()}

    def name(self, good_id: int) -> str:
        return self.goods[good_id]["name"]

    def market_of(self, source_id: int) -> int | None:
        market = self.burgs.get(source_id, {}).get("market")
        return market if market in self.markets else None

    def production(self, source_id: int, businesses: list[Business]) -> list[ProductionLine]:
        """Entries of the same good merge; order of first appearance is kept, so inputs precede their products."""
        merged: dict[str, dict[str, Any]] = {}
        for entry in self.burgs[source_id].get("production") or []:
            if not isinstance(entry, dict) or entry.get("goodId") not in self.goods:
                continue
            line = merged.setdefault(self.name(entry["goodId"]), {"units": 0.0, "inputs": defaultdict(float), "recipe": False})
            line["units"] += float(entry.get("units") or 0)
            for r in entry.get("recipe") or []:
                if r.get("goodId") in self.goods:
                    line["recipe"] = True
                    line["inputs"][self.name(r["goodId"])] += float(r.get("units") or 0)
        staffed = {b.good for b in businesses if b.good and b.sector in EXTRACTION_SECTORS}
        return [ProductionLine(good=good, units=round(v["units"], 4), inputs={g: round(u, 4) for g, u in v["inputs"].items()},
                               source="workshop" if v["recipe"] else "extraction" if good in staffed else "hinterland")
                for good, v in merged.items()]

    def consumption(self, source_id: int, lines: list[ProductionLine]) -> dict[str, float]:
        """What the market sold the burg beyond its recipe inputs: its own use."""
        bought: dict[str, float] = defaultdict(float)
        for d in self.deals:
            if d["buyerType"] == "burg" and d["buyer"] == source_id and d["sellerType"] == "market":
                bought[self.name(d["good"])] += d["units"]
        for line in lines:
            for good, units in line.inputs.items():
                bought[good] -= units
        return {g: round(u, 4) for g, u in sorted(bought.items()) if u > 1e-3}

    def outside_flows(self, market_id: int, scoped: set[int], goods: set[str]) -> dict[str, tuple[float, float]]:
        """
        (supply, demand) a month between the market and everyone outside the scope. Azgaar fills
        markets with rural output that no deal records, so whatever the market sold beyond what it
        bought counts as outside supply, and whatever it bought beyond what it sold as outside
        demand; with scoped members trading as recorded, every good then balances.
        """
        sold: dict[str, list[float]] = {g: [0.0, 0.0] for g in goods}     # [to anyone, to outside]
        bought: dict[str, list[float]] = {g: [0.0, 0.0] for g in goods}   # [from anyone, from outside]
        for d in self.deals:
            good = self.name(d["good"])
            if good not in sold:
                continue
            if d["sellerType"] == "market" and d["seller"] == market_id:
                outside = d["buyerType"] == "market" or d["buyer"] not in scoped
                sold[good][0] += d["units"]
                sold[good][1] += d["units"] if outside else 0
            if d["buyerType"] == "market" and d["buyer"] == market_id:
                outside = d["sellerType"] == "market" or d["seller"] not in scoped
                bought[good][0] += d["units"]
                bought[good][1] += d["units"] if outside else 0
        return {g: (round(bought[g][1] + max(0.0, sold[g][0] - bought[g][0]), 4),
                    round(sold[g][1] + max(0.0, bought[g][0] - sold[g][0]), 4)) for g in sorted(goods)}

    def market_good(self, market_id: int, good: str) -> tuple[float, float]:
        """(price, stock) the market recorded; goods it never priced fall back to their Azgaar value."""
        good_id = self.good_ids[good]
        recorded = (self.markets[market_id].get("goods") or {}).get(str(good_id)) or {}
        price = recorded.get("price") or self.goods[good_id].get("value") or 1
        return float(price), float(recorded.get("stock") or 0)
