"""
Traders' households and the businesses idle hands make. Each month a trader's household
lives off their purse (the money is spent in their home town) and their businesses pay
dividends. Towns with people out of work open businesses in the sector furthest below
its share for the town's class, funded by a rich trader or else the town; businesses
without Azgaar evidence close after months with nobody to work them.
"""

from typing import Any

from ..contracts import Business, Society
from .contracts import SettlementEconomy, Trader
from .escorts import KIND as ESCORTS

SECTORS = ("agriculture", "extraction", "crafts", "trade", "services", "security")


def household_month(traders: list[Trader], econs: dict[str, SettlementEconomy], filled: dict[str, int],
                    cfg: dict[str, Any]) -> list[Trader]:
    """Upkeep out of each purse into the home town; dividends from the town into the purse of whoever funded a business."""
    t, per_worker = cfg["traders"], cfg["turnover"]["dividendPerWorkerMonth"]
    out = []
    for trader in traders:
        low, high = t["lifestyle"]
        lifestyle = low + (high - low) * trader.personality.greed
        upkeep = t["livingPerAdultMonth"] * (trader.household.adults + 0.5 * trader.household.children) * lifestyle
        dividends = per_worker * sum(filled.get(b, 0) for b in trader.owns)
        home = econs.get(trader.settlementId)
        if home is not None:
            econs[trader.settlementId] = home.model_copy(update={"treasury": round(home.treasury + upkeep - dividends, 2)})
        card = trader.scorecard.model_copy(update={"livingCosts": round(trader.scorecard.livingCosts + upkeep, 2),
                                                   "dividends": round(trader.scorecard.dividends + dividends, 2)})
        out.append(trader.model_copy(update={"purse": round(trader.purse - upkeep + dividends, 2), "scorecard": card}))
    return out


def _close(society: Society, cfg: dict[str, Any]) -> tuple[list[Business], list[Business]]:
    keep, closed = [], []
    for b in society.businesses:
        idle = b.idleMonths + 1 if b.filled == 0 else 0
        b = b if idle == b.idleMonths else b.model_copy(update={"idleMonths": idle})
        evidenced = b.evidence is not None or b.kind == ESCORTS
        (closed if not evidenced and b.idleMonths >= cfg["closeAfterIdleMonths"] else keep).append(b)
    return keep, closed


def _next_kind(businesses: list[Business], supply: int, shares: dict[str, float],
               templates: dict[str, Any]) -> tuple[str, dict[str, Any]] | None:
    """A generic kind in the sector furthest below its share of the labour force."""
    generic = {k: t for k, t in templates.items() if not t.get("requires") and not t.get("evidence")}
    posts = {s: sum(b.staff for b in businesses if b.sector == s) for s in SECTORS}
    sectors = sorted((s for s in SECTORS if any(t["sector"] == s for t in generic.values())),
                     key=lambda s: (-(shares.get(s, 0) * supply - posts[s]), s))
    if not sectors:
        return None
    count = {k: sum(b.kind == k for b in businesses) for k in generic}
    kind = min((k for k, t in generic.items() if t["sector"] == sectors[0]), key=lambda k: (count[k], k))
    return kind, generic[kind]


Outcome = tuple[Society, SettlementEconomy, list[Trader], list[dict[str, Any]], bool]


def turnover(society: Society, econ: SettlementEconomy, traders: list[Trader], *, settlement: dict[str, Any], day: int,
             cfg: dict[str, Any], society_cfg: dict[str, Any]) -> Outcome:
    """Closes idle businesses and opens new ones for the idle; the flag says whether jobs must be refilled."""
    tc = cfg["turnover"]
    by_id = {t.id: t for t in traders}
    businesses, closed = _close(society, tc)
    incidents = [{"kind": "closed", "message": f"{b.name} closed after {b.idleMonths} months with nobody to work it",
                  "settlementId": settlement["id"], "businessId": b.id, "trader": b.ownerId,
                  "facts": {"idleMonths": b.idleMonths}, "effects": [{"entityId": b.id, "kind": "closed", "severity": 1.0}]}
                 for b in closed]
    for b in closed:
        if b.ownerId in by_id:
            owner = by_id[b.ownerId]
            by_id[b.ownerId] = owner.model_copy(update={"owns": [x for x in owner.owns if x != b.id]})

    idle = society.employment.unemployed
    supply = society.employment.labourSupply
    shares = society_cfg["labour"]["sectorShareByClass"][settlement["class"] or "town"]
    seq, opened = econ.businessSeq, 0
    while idle >= tc["minIdle"] and opened < tc["maxOpeningsPerMonth"]:
        pick = _next_kind(businesses, supply, shares, society_cfg["businesses"])
        if pick is None:
            break
        kind, t = pick
        cost = tc["costPerPost"] * t["staff"]
        investors = sorted((x for x in by_id.values() if x.settlementId == settlement["id"]
                            and x.purse > cfg["traders"]["investAbove"] and x.purse >= cost), key=lambda x: (-x.purse, x.id))
        owner = investors[0] if investors else None
        if owner is None and econ.treasury - cost < tc["treasuryReserve"]:
            break
        seq += 1
        business = Business(id=f"business:azgaar-burg:{settlement['sourceId']}:{kind}:o{seq}", settlementId=settlement["id"], kind=kind,
                            name=f"{settlement['name']} {t['label']} (new {seq})", sector=t["sector"], profession=t["profession"],
                            staff=t["staff"], wage=t["wage"], filled=0, ownerId=owner.id if owner else None, openedDay=day)
        businesses.append(business)
        if owner:
            card = owner.scorecard.model_copy(update={"invested": round(owner.scorecard.invested + cost, 2)})
            by_id[owner.id] = owner.model_copy(update={"purse": round(owner.purse - cost, 2), "owns": [*owner.owns, business.id],
                                                       "scorecard": card})
        else:
            econ = econ.model_copy(update={"treasury": round(econ.treasury - cost, 2)})
        funder = f"{owner.name}'s money" if owner else "the town treasury"
        incidents.append({"kind": "opened", "message": f"{business.name} opened with {funder} for {idle:,} people without work",
                          "trader": owner.id if owner else None, "value": round(cost, 2), "settlementId": settlement["id"],
                          "businessId": business.id, "facts": {"cost": round(cost, 2), "posts": t["staff"], "idleAtOpening": idle,
                                                               "fundedBy": "trader" if owner else "town"}})
        idle -= t["staff"]
        opened += 1
    econ = econ.model_copy(update={"businessSeq": seq, "opened": econ.opened + opened, "closed": econ.closed + len(closed)})
    society = society.model_copy(update={"businesses": businesses})
    return society, econ, [by_id[t.id] for t in traders], incidents, bool(opened or closed)
