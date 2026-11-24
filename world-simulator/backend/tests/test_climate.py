from world_sim.simulation.climate import for_month
from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.migrations import migrate_state
from world_sim.simulation.rules import complete, freeze


def test_climate_is_deterministic_and_biome_dependent(eldara):
    cfg = eldara.config.simulation["climate"]
    a = for_month("Hot desert", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    b = for_month("Tundra", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    assert a == for_month("Hot desert", month_index=5, months_per_year=12, seed=5, settlement_id="town", cfg=cfg)
    assert a.profile == "arid" and b.profile == "cold"
    assert a.yieldFactor != b.yieldFactor


def test_climate_survives_chunking_and_migration(eldara):
    state = baseline_state(eldara, scenario_id="climate", settlement_ids=sorted(eldara.pilot_ids),
                           seed=7, start_year=1212)
    whole = advance(state, 90, eldara.config.rules)[0]
    parts = advance(advance(state, 60, eldara.config.rules)[0], 30, eldara.config.rules)[0]
    assert state_checksum(whole) == state_checksum(parts)
    raw = state.model_dump()
    raw["schemaVersion"] = 9
    for row in raw["settlements"]:
        row.pop("climate")
    migrated, old = migrate_state(raw, eldara, eldara.config.rules)
    assert old == 9
    assert all(row.climate.month == 1 for row in migrated.settlements)


def test_old_frozen_scenarios_keep_neutral_climate(eldara):
    frozen = freeze(eldara.config.rules)
    del frozen["simulation"]["climate"]
    rules = complete(frozen, eldara.config.rules)
    assert not rules["simulation"]["climate"]["enabled"]
    assert for_month("Hot desert", month_index=5, months_per_year=12, seed=7,
                     settlement_id="town", cfg=rules["simulation"]["climate"]).yieldFactor == 1


def test_seasonal_harvest_and_spoilage_balance_food(eldara):
    from world_sim.simulation.economy.production import run_production

    state = baseline_state(eldara, scenario_id="seasonal-food", settlement_ids=sorted(eldara.pilot_ids),
                           seed=7, start_year=1212)
    town = state.settlements[0]
    args = (town.economy, town.society, town.population, eldara.config.rules)
    low, low_flow = run_production(*args, harvest_factor=0.35)
    high, _ = run_production(*args, harvest_factor=1.5)
    assert low.food.local <= high.food.local
    assert low.food.hinterland < high.food.hinterland
    assert low.food.spoiled > 0
    rations = eldara.config.economy["food"]["good"]
    assert abs(low.inventory[rations] - (town.economy.inventory[rations] + low_flow[rations])) < 0.01
    assert high.food.yieldFactor == 1.5


def test_legacy_economy_keeps_food_without_seasonal_rules(eldara):
    from world_sim.simulation.economy.production import run_production

    state = baseline_state(eldara, scenario_id="old-food", settlement_ids=sorted(eldara.pilot_ids),
                           seed=4, start_year=1212)
    town = state.settlements[0]
    old = {**eldara.config.rules, "economy": {k: v for k, v in eldara.config.economy.items() if k != "agriculture"}}
    econ, _ = run_production(town.economy, town.society, town.population, old, harvest_factor=0.1)
    assert econ.food.spoiled == 0
    assert econ.food.yieldFactor == 1
