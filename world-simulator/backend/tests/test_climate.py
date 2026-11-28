from world_sim.simulation.climate import for_month
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.migrations import migrate_state
from world_sim.simulation.rules import complete, freeze


def test_climate_is_deterministic_and_biome_dependent(astalor):
    cfg = astalor.config.simulation["climate"]
    a = for_month("Hot desert", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    b = for_month("Tundra", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    assert a == for_month("Hot desert", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    assert a.profile == "arid" and b.profile == "cold"
    assert a.yieldFactor != b.yieldFactor


def test_climate_survives_chunking_and_migration(astalor):
    state = baseline_state(astalor, scenario_id="climate", settlement_ids=sorted(astalor.pilot_ids),
                           seed=7, start_year=1212)
    whole = advance(state, 90, astalor.config.rules)[0]
    parts = advance(advance(state, 60, astalor.config.rules)[0], 30, astalor.config.rules)[0]
    assert state_checksum(whole) == state_checksum(parts)
    raw = state.model_dump()
    raw["schemaVersion"] = 9
    for row in raw["settlements"]:
        row.pop("climate")
    migrated, old = migrate_state(raw, astalor, astalor.config.rules)
    assert old == 9
    assert all(row.climate.month == 1 for row in migrated.settlements)


def test_old_frozen_scenarios_keep_neutral_climate(astalor):
    frozen = freeze(astalor.config.rules)
    del frozen["simulation"]["climate"]
    rules = complete(frozen, astalor.config.rules)
    assert not rules["simulation"]["climate"]["enabled"]
    assert for_month("Hot desert", month_index=5, months_per_year=12, seed=7,
                     settlement_id="town", cfg=rules["simulation"]["climate"]).yieldFactor == 1


def test_seasonal_harvest_and_spoilage_balance_food(astalor):
    from world_sim.simulation.economy.production import run_production

    state = baseline_state(astalor, scenario_id="seasonal-food", settlement_ids=sorted(astalor.pilot_ids),
                           seed=7, start_year=1212)
    town = state.settlements[0]
    args = (town.economy, town.society, town.population, astalor.config.rules)
    low, low_flow = run_production(*args, harvest_factor=0.35)
    high, _ = run_production(*args, harvest_factor=1.5)
    assert low.food.local <= high.food.local
    assert low.food.hinterland < high.food.hinterland
    assert low.food.spoiled > 0
    rations = astalor.config.economy["food"]["good"]
    assert abs(low.inventory[rations] - (town.economy.inventory[rations] + low_flow[rations])) < 0.01
    assert high.food.yieldFactor == 1.5


def test_legacy_economy_keeps_food_without_seasonal_rules(astalor):
    from world_sim.simulation.economy.production import run_production

    state = baseline_state(astalor, scenario_id="old-food", settlement_ids=sorted(astalor.pilot_ids),
                           seed=4, start_year=1212)
    town = state.settlements[0]
    old = {**astalor.config.rules, "economy": {k: v for k, v in astalor.config.economy.items() if k != "agriculture"}}
    econ, _ = run_production(town.economy, town.society, town.population, old, harvest_factor=0.1)
    assert econ.food.spoiled == 0
    assert econ.food.yieldFactor == 1


def test_harvest_event_is_scoped_to_its_own_settlement(astalor):
    from world_sim.simulation.economy.step import economy_month

    state = baseline_state(astalor, scenario_id="harvest-scope", settlement_ids=sorted(astalor.pilot_ids),
                           seed=10, start_year=1212)
    first = state.settlements[0]
    changed = [
        s.model_copy(update={"climate": s.climate.model_copy(update={
            "yieldFactor": 0.20 if s.settlementId == first.settlementId else 1.0,
            "hazard": "drought" if s.settlementId == first.settlementId else None})})
        for s in state.settlements
    ]
    _, _, result = economy_month(changed, state.trade, 30, astalor.config.rules, seed=10)
    shortfalls = [i for i in result["incidents"] if i["kind"] == "harvest-shortfall"]
    assert len(shortfalls) == 1
    assert shortfalls[0]["settlementId"] == first.settlementId
    assert shortfalls[0]["facts"]["yieldFactor"] == 0.20
