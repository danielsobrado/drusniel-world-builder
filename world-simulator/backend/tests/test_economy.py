"""PR4 acceptance: production, stock, markets, prices, caravans, supply chains and shortages."""

from fastapi.testclient import TestClient

from world_sim.api.app import create_app
from world_sim.simulation.engine import advance, baseline_state, state_checksum


def pilot(model, seed=1212):
    ids = [r["settlementId"] for r in model.pilot["roles"]]
    return baseline_state(model, scenario_id="t", settlement_ids=ids, seed=seed, start_year=1212)


def by_name(state):
    return {s.name: s for s in state.settlements}


def with_market_good(state, good, **fields):
    """The state with one market good's fields replaced (a supply shock)."""
    [market] = state.trade.markets
    goods = {**market.goods, good: market.goods[good].model_copy(update=fields)}
    return state.model_copy(update={"trade": state.trade.model_copy(update={"markets": [market.model_copy(update={"goods": goods})]})})


def test_baseline_economy_follows_azgaar_production_and_deals(eldara):
    s = by_name(pilot(eldara))
    vhaltha = {line.good: line for line in s["Vhaltha"].economy.production}
    assert list(vhaltha) == ["Barrels", "Beer", "Cloth", "Sails"], "Azgaar order keeps inputs before their products"
    assert vhaltha["Cloth"].inputs == {"Hemp": 6.0} and vhaltha["Sails"].inputs == {"Cloth": 5.75}
    assert all(line.source == "workshop" for line in vhaltha.values())
    assert {line.good: line.source for line in s["Falanenerwin"].economy.production}["Amber"] == "hinterland", \
        "an extracted good with no business is credited to the rural hinterland"
    # Bought beyond recipe inputs: Falanenerwin's own use (deals 6580-6583 and the Furs left over from Boots).
    assert s["Falanenerwin"].economy.consumption == {"Furs": 0.88, "Grain": 1.25, "Sails": 0.5, "Wood": 0.94}
    [market] = pilot(eldara).trade.markets
    assert (market.marketId, market.centerName, market.centerInScope) == (15, "Vhaltha", True)
    assert s["Vhaltha"].economy.travelDays == 0 and s["Falanenerwin"].economy.travelDays == 7
    assert market.goods["Hemp"].basePrice == 0.32, "prices start at the Azgaar market's"
    for settlement in s.values():
        assert settlement.economy.food.ruralPopulation > 0
        assert [n.id for n in settlement.society.needs] == ["food", "housing", "livelihood", "safety"]


def test_a_decade_trades_with_rare_shortages_and_keeps_prices_near_azgaar(eldara):
    no_harvest = {**eldara.config.rules,
                  "economy": {k: v for k, v in eldara.config.economy.items()
                              if k not in ("agriculture", "householdFinances")},
                  "simulation": {**eldara.config.simulation, "climate": {"enabled": False}}}
    state, months = advance(pilot(eldara), 3600, no_harvest)
    assert all(m["foodSecurity"] == 1.0 for m in months)
    short = [i for i, m in enumerate(months) if m["shortages"]]
    assert len(short) <= 12, "goods run short only now and then, after bandits take a caravan's cargo"
    raided = {i for i, m in enumerate(months) if m["raids"]}
    assert all(any(j in raided for j in range(i - 3, i + 1)) for i in short)
    assert sum(m["caravans"] for m in months) > 200 and state.trade.delivered
    [market] = state.trade.markets
    for good, mg in market.goods.items():
        if good != "Rations":
            assert 0.8 < mg.price / mg.basePrice < 1.25, f"{good} drifted to {mg.price / mg.basePrice:.2f}x"
    assert len(market.priceHistory) == eldara.config.economy["market"]["maxPricePoints"]
    for s in state.settlements:
        assert all(line.produced == line.units for line in s.economy.production), "fully staffed and supplied"


def test_caravans_carry_purchases_after_their_travel_time(eldara):
    state, _ = advance(pilot(eldara), 30, eldara.config.rules)
    purchases = {c.toName: c for c in state.trade.caravans if c.kind == "purchase"}
    purchase = purchases["Falanenerwin"]
    assert purchase.fromName == "Vhaltha" and purchase.departDay == 37 and purchase.arriveDay == 44
    assert "Vhaltha" not in purchases, "the market centre trades without caravans"
    state, _ = advance(state, 13, eldara.config.rules)
    assert all(c.id != purchase.id for c in state.trade.delivered)
    state, _ = advance(state, 1, eldara.config.rules)
    assert any(c.id == purchase.id for c in state.trade.delivered)



def test_a_cut_supply_chain_stops_its_product_and_reroutes_the_next_one(eldara):
    shocked = with_market_good(pilot(eldara), "Hemp", outsideSupply=0, stock=0)
    state, months = advance(shocked, 180, eldara.config.rules)
    lines = {line.good: line for line in by_name(state)["Vhaltha"].economy.production}
    assert lines["Cloth"].limitedBy == "Hemp" and lines["Cloth"].produced < 1
    vhaltha = by_name(state)["Vhaltha"].economy
    assert "Hemp" in {x.good for x in vhaltha.shortages}
    [market] = state.trade.markets
    assert market.goods["Hemp"].price > 3 * market.goods["Hemp"].basePrice
    # Sails go on from cloth bought in, which bids up cloth for everyone else in the market.
    assert lines["Sails"].produced > 0 and vhaltha.bought.get("Cloth", 0) > 1
    assert market.goods["Cloth"].price > 1.1 * market.goods["Cloth"].basePrice
    assert months[-1]["shortages"] > 0


def test_famine_raises_mortality_and_turns_food_critical(eldara):
    def starve(state):
        settlements = [s.model_copy(update={"economy": s.economy.model_copy(update={
            "inventory": {**s.economy.inventory, "Rations": 0},
            "food": s.economy.food.model_copy(update={"ruralPopulation": 0})})}) for s in state.settlements]
        return with_market_good(state.model_copy(update={"settlements": settlements}), "Rations", stock=0)

    fed, _ = advance(pilot(eldara), 360, eldara.config.rules)
    hungry, _ = advance(starve(pilot(eldara)), 360, eldara.config.rules)
    assert sum(s.deaths for s in hungry.settlements) > 1.3 * sum(s.deaths for s in fed.settlements)
    food = {s.name: s.society.needs[0] for s in hungry.settlements}
    assert food["Vhaltha"].id == "food" and food["Vhaltha"].status == "critical"
    assert all(s.economy.food.security < 1 for s in hungry.settlements)


def test_economy_reproduces_with_the_same_seed(eldara):
    a, _ = advance(pilot(eldara), 720, eldara.config.rules)
    b, _ = advance(pilot(eldara), 720, eldara.config.rules)
    assert state_checksum(a) == state_checksum(b)
    assert a.trade == b.trade


def test_economy_endpoint(fresh_model):
    client = TestClient(create_app(fresh_model))
    client.post("/api/scenarios/baseline-pilot/step", json={"unit": "year"})
    body = client.get("/api/scenarios/baseline-pilot/economy?delivered=5").json()["data"]
    assert {s["name"] for s in body["settlements"]} == {"Falanenerwin", "Sshanderi", "Vhaltha"}
    assert "society" not in body["settlements"][0]
    assert body["markets"][0]["centerName"] == "Vhaltha" and len(body["delivered"]) == 5
    assert body["delivered"][0]["arriveDay"] >= body["delivered"][-1]["arriveDay"], "newest first"
    assert client.get("/api/scenarios/baseline-pilot/economy?delivered=500").status_code == 400
