"""Traders' purses and households, businesses opening and closing, and pirates on the sea lanes."""

from world_sim.simulation.contracts import Business, Scope
from world_sim.simulation.economy.contracts import Caravan, Household, Personality, Trader
from world_sim.simulation.economy.trips import TripContext, _gate
from world_sim.simulation.economy.turnover import turnover
from world_sim.simulation.engine import advance, baseline_state
from world_sim.simulation.scope import resolve_scope


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def test_openings_hold_unemployment_and_traders_invest(eldara):
    state, months = advance(pilot(eldara), 3600, eldara.config.rules)
    assert months[-1]["unemployed"] < 400, "without openings the pilot reached about 1,200 people without work"
    opened = [b for s in state.settlements for b in s.society.businesses if b.openedDay is not None]
    assert opened and all(b.id.split(":")[-1].startswith("o") for b in opened)
    owners = {t.id: t for t in state.trade.traders if t.owns}
    assert owners, "a trader with savings funds a business in their home town"
    for t in owners.values():
        owned = [b for b in opened if b.ownerId == t.id]
        assert {b.id for b in owned} == set(t.owns) and all(b.settlementId == t.settlementId for b in owned)
        assert t.scorecard.dividends > 0 and t.scorecard.invested > 0


def test_a_traders_purse_accounts_for_every_flow(eldara):
    start = pilot(eldara)
    state, _ = advance(start, 1800, eldara.config.rules)
    before = {t.id: t for t in start.trade.traders}
    for t in state.trade.traders:
        if t.id not in before:
            continue
        c = t.scorecard
        expected = before[t.id].purse + c.commission + c.taxEvaded - c.fines - c.livingCosts + c.dividends - c.invested
        assert abs(t.purse - expected) < 0.05 * max(1, c.trips + 60), t.name
        assert c.livingCosts > 0, "every household lives off its purse"


def test_debt_pushes_an_honest_enough_trader_to_smuggle(eldara):
    cfg = eldara.config.economy
    [market] = pilot(eldara).trade.markets
    caravan = Caravan(id="caravan:1", kind="sale", marketId=15, fromId="a", fromName="A", toId="b", toName="B",
                      cargo={"Amber": 6.0}, value=46.0, departDay=0, arriveDay=7)

    def hidden(purse):
        trader = Trader(id="npc:trader:1", name="Test", settlementId="a", settlementName="A", routeId="r",
                        personality=Personality(greed=0.5, caution=0.3, honesty=0.5), household=Household(adults=1, children=0),
                        purse=purse)
        ctx = TripContext(seed=1, day=0, cfg=cfg, markets={15: market}, econs={}, escorts_filled={}, safety={}, routes={},
                          traders=[trader], trader_seq=1)
        return _gate(ctx, trader, caravan, market)[0].smuggled

    assert hidden(40.0) == 0, "greed and honesty in balance: nothing hidden while solvent"
    assert hidden(-100.0) > 0, "deep debt tips the same trader into hiding cargo"


def test_unstaffed_businesses_without_evidence_close(eldara):
    state = pilot(eldara)
    s = state.settlements[0]
    idle = Business(id="business:azgaar-burg:1:tavern:o9", settlementId=s.settlementId, kind="tavern", name="Idle tavern",
                    sector="services", profession="innkeeper", staff=4, wage=3, filled=0, idleMonths=5)
    proven = idle.model_copy(update={"id": "business:azgaar-burg:1:workshop-x:1", "evidence": "Azgaar records crafting of X"})
    society = s.society.model_copy(update={"businesses": [*s.society.businesses, idle, proven]})
    home = {"id": s.settlementId, "sourceId": s.sourceId, "name": s.name, "class": s.economy.settlementClass}
    after, econ, _, incidents, restaff = turnover(society, s.economy, [], settlement=home, day=30, cfg=eldara.config.economy,
                                                  society_cfg=eldara.config.society)
    ids = {b.id for b in after.businesses}
    assert idle.id not in ids and proven.id in ids, "Azgaar-evidenced businesses never close"
    assert restaff and econ.closed == 1 and incidents[0]["kind"] == "closed"


def test_pirates_haunt_a_sea_lane_founded_by_an_azgaar_sighting(fresh_model):
    ids = resolve_scope(fresh_model, Scope(type="settlements", settlementIds=["settlement:azgaar-burg:358", "settlement:azgaar-burg:449"]),
                        120)
    state = baseline_state(fresh_model, scenario_id="sea", settlement_ids=ids, seed=7, start_year=1212)
    [lane] = state.trade.routes
    assert (lane.mode, lane.settlementName, lane.centerName) == ("sea", "Qeqashuth", "Chix")
    assert lane.lair == "Pirates" and lane.bandits == 24 and lane.days == 7, "quicker by ship than the 14-day road"
    state, months = advance(state, 1800, fresh_model.config.rules)
    raids = [i["message"] for m in months for i in m["incidents"] if i["kind"] == "raid"]
    assert raids and all(r.startswith("Pirates") and "sea lane" in r for r in raids)
    assert state.trade.routes[0].bandits >= 8
