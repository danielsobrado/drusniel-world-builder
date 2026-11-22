import copy
import dataclasses

import pytest

from world_sim.config import load_config
from world_sim.world.model import build_world_model


@pytest.fixture(scope="session")
def config(tmp_path_factory):
    return load_config(env={"WS_SCENARIO_STORAGE": str(tmp_path_factory.mktemp("scenarios"))})


@pytest.fixture(scope="session")
def eldara(config):
    """The real Eldara model, built once per test session."""
    return build_world_model(config)


@pytest.fixture
def fresh_model(eldara, tmp_path):
    """The Eldara model with its own empty scenario storage."""
    simulation = {**eldara.config.simulation, "storage": str(tmp_path / "scenarios")}
    return dataclasses.replace(eldara, config=dataclasses.replace(eldara.config, simulation=simulation))


def _cell(i):
    return {"i": i, "pop": 1, "biome": 6, "h": 30, "t": 2, "f": 1, "r": 0, "province": 1}


FIXTURE = {
    "info": {"width": 100, "height": 100, "version": "test", "seed": "1", "mapId": 1},
    "settings": {"populationRate": 1000, "urbanization": 1, "distanceScale": 3, "distanceUnit": "mi", "options": {}},
    "biomesData": {"name": ["Marine", "Hot desert", "Cold desert", "Savanna", "Grassland",
                            "Tropical seasonal forest", "Temperate deciduous forest"]},
    "pack": {
        "cells": [_cell(i) for i in range(12)],
        "states": [{"i": 0, "name": "Neutrals"}, {"i": 1, "name": "Alpha", "rural": 2}, {"i": 2, "name": "Gone", "removed": True}],
        "provinces": [0, {"i": 1, "name": "North", "state": 1}],
        "cultures": [{"i": 0, "name": "Wildlands"}, {"i": 1, "name": "Folk"}],
        "goods": [{"i": 1, "name": "Iron", "tags": ["ore"]}, {"i": 2, "name": "Grain", "tags": ["food"]},
                  {"i": 3, "name": "Tools", "tags": ["construction"]}],
        "markets": [{"i": 1, "centerBurgId": 3}],
        "burgs": [
            {},
            {"i": 1, "name": "One", "x": 10, "y": 10, "cell": 1, "state": 1, "culture": 1, "population": 0.5, "capital": 1,
             "production": [{"goodId": 1, "units": 1}]},
            {"i": 2, "name": "Two", "x": 20, "y": 10, "cell": 2, "state": 1, "culture": 1, "population": 2.5,
             "production": [{"goodId": 2, "units": 1}]},
            {"i": 3, "name": "Three", "x": 30, "y": 10, "cell": 3, "state": 1, "culture": 1, "population": 16, "port": 1,
             "production": [{"goodId": 3, "units": 1, "recipe": [{"goodId": 1, "units": 1}]}]},
            {"i": 4, "name": "Four", "x": 40, "y": 10, "cell": 4, "state": 1, "culture": 1, "population": 30},
            {"i": 5, "name": "Lonely", "x": 21, "y": 12, "cell": 5, "state": 1, "culture": 1, "population": 1},
            {"i": 6, "name": "Removed", "x": 50, "y": 50, "cell": 6, "removed": True, "population": 5},
            {"i": 7, "name": "", "x": 60, "y": 60, "cell": 7, "population": 5},
        ],
        # Burgs 1-4 on one chain (2 and 3 meet at junction cell 9); 5 isolated; route 2 reaches nobody.
        "routes": [
            {"i": 0, "group": "roads", "points": [[10, 10, 1], [20, 10, 2], [25, 10, 9]]},
            {"i": 1, "group": "trails", "points": [[25, 10, 9], [30, 10, 3], [40, 10, 4]]},
            {"i": 2, "group": "trails", "points": [[70, 70, 10], [80, 80, 11]]},
            {"i": 3, "group": "searoutes", "points": [[30, 10, 3], [21, 12, 5]]},
        ],
    },
}


@pytest.fixture
def fixture_document():
    return copy.deepcopy(FIXTURE)
