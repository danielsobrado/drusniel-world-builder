from world_sim.simulation.engine import advance, baseline_state, state_checksum
from world_sim.simulation.finance import baseline, month
from world_sim.simulation.migrations import migrate_state


def test_aggregate_household_budget_is_bounded(eldara):
    cfg = eldara.config.economy["householdFinances"]
    accounts = baseline(100, cfg)
    after = month(accounts, households=100, population=400, income=0, ration_price=0.003,
                  ration_multiplier=1, rations_per_person_day=1, days=30, cfg=cfg)
    assert sum(t.households for t in after.tiers) == 100
    assert all(t.savings >= 0 and t.arrears >= 0 for t in after.tiers)
    assert after.foodAccess < 1 and after.strugglingHouseholds > 0


def test_aggregate_finances_survive_replay_and_legacy_migration(eldara):
    state = baseline_state(eldara, scenario_id="finance", settlement_ids=sorted(eldara.pilot_ids),
                           seed=8, start_year=1212)
    whole, _ = advance(state, 90, eldara.config.rules)
    split = advance(advance(state, 30, eldara.config.rules)[0], 60, eldara.config.rules)[0]
    assert state_checksum(whole) == state_checksum(split)
    assert all(s.economy.finances.tiers for s in whole.settlements)
    raw = state.model_dump()
    raw["schemaVersion"] = 11
    for s in raw["settlements"]:
        s["economy"].pop("finances")
    migrated, version = migrate_state(raw, eldara, eldara.config.rules)
    assert version == 11
    assert all(not s.economy.finances.tiers for s in migrated.settlements)


def test_prolonged_unaffordable_food_enters_canonical_history(eldara):
    economy = {**eldara.config.economy}
    finance_cfg = {**economy["householdFinances"], "copperPerTradeValue": 1000000}
    economy["householdFinances"] = finance_cfg
    rules = {**eldara.config.rules, "economy": economy}
    state = baseline_state(eldara, scenario_id="hardship", settlement_ids=sorted(eldara.pilot_ids),
                           seed=9, start_year=1212, rules=rules)
    after, months = advance(state, 60, rules)
    kinds = [event.kind for summary in months for event in summary["events"]]
    assert "household-hardship" in kinds
    assert any(s.economy.finances.hardshipMonths == 2 for s in after.settlements)
