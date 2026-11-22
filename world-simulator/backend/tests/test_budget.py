import pytest

from world_sim.npc.budget import allocate_npc_budget

RANGES = {"small": {"min": 4, "max": 12}, "big": {"min": 10, "max": 20}}


def town(source_id, population, **extra):
    return {"id": f"s{source_id}", "sourceId": source_id, "population": population,
            "class": "big" if population >= 1000 else "small", "economy": {}, **extra}


TOWNS = [town(1, 100), town(2, 400), town(3, 900), town(4, 1600), town(5, 2500)]


@pytest.mark.parametrize("target", [32, 40, 50, 60, 76])
def test_ranges_hold_and_the_sum_equals_the_target(target):
    budget = allocate_npc_budget(TOWNS, target=target, ranges=RANGES)
    assert budget["feasible"] and budget["allocated"] == target
    assert all(a["min"] <= a["npcs"] <= a["max"] for a in budget["allocations"])


def test_allocation_is_deterministic_and_order_independent():
    assert allocate_npc_budget(TOWNS, target=47, ranges=RANGES) == allocate_npc_budget(TOWNS[::-1], target=47, ranges=RANGES)


def test_infeasible_targets_stop_at_the_bounds():
    low = allocate_npc_budget(TOWNS, target=10, ranges=RANGES)
    assert not low["feasible"] and low["allocated"] == low["minimumTotal"] and "below" in low["reason"]
    high = allocate_npc_budget(TOWNS, target=500, ranges=RANGES)
    assert not high["feasible"] and high["allocated"] == high["maximumTotal"] and "exceeds" in high["reason"]
    assert all(a["npcs"] == a["max"] for a in high["allocations"])


def test_capital_importance_raises_the_share():
    plain, capital = allocate_npc_budget([town(1, 400), town(2, 400, capital=True)], target=14, ranges=RANGES,
                                         importance={"capital": 2})["allocations"]
    assert capital["npcs"] > plain["npcs"]


def test_remainder_ties_resolve_by_source_id():
    budget = allocate_npc_budget([town(2, 400), town(1, 400)], target=9, ranges=RANGES)
    assert [(a["sourceId"], a["npcs"]) for a in budget["allocations"]] == [(1, 5), (2, 4)]


def test_settlements_below_the_eligibility_floor_get_nothing():
    budget = allocate_npc_budget([town(1, 0), town(2, 400)], target=6, ranges=RANGES, minimumEligiblePopulation=1)
    assert budget["eligibleSettlements"] == 1 and len(budget["allocations"]) == 1


def test_eldara_scenarios_report_feasibility_honestly(eldara, config):
    by_target = {s["target"]: s for s in eldara.scenarios}
    assert list(by_target) == config.npc["comparisonScenarios"]
    assert by_target[10040]["feasible"] and by_target[10040]["allocated"] == 10040
    for s in eldara.scenarios:
        assert s["feasible"] == (s["minimumTotal"] <= s["target"] <= s["maximumTotal"])
