"""Deterministic monthly climate derived from biome and frozen simulation rules."""

import random

from pydantic import BaseModel, ConfigDict, Field


class ClimateState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    month: int = Field(default=1, ge=1)
    profile: str = "neutral"
    season: str = "neutral"
    rainfall: float = Field(default=1.0, ge=0)
    yieldFactor: float = Field(default=1.0, ge=0)
    hazard: str | None = None


def _profile(biome: str | None, cfg: dict) -> str:
    name = (biome or "").casefold()
    for keyword, profile in cfg["biomeProfiles"].items():
        if keyword in name:
            return profile
    return cfg["defaultProfile"]


def for_month(biome: str | None, *, month_index: int, months_per_year: int, seed: int,
              settlement_id: str, cfg: dict) -> ClimateState:
    month = month_index % months_per_year + 1
    if not cfg.get("enabled", False):
        return ClimateState(month=month)
    index = (month - 1) * 12 // months_per_year
    profile = _profile(biome, cfg)
    seasonal = cfg["profiles"][profile][index]
    rng = random.Random(f"{seed}:{month_index}:{settlement_id}:climate")
    rainfall = max(0.0, 1 + rng.uniform(-cfg["rainfallVariability"], cfg["rainfallVariability"]))
    factor = seasonal * (1 + cfg["rainfallSensitivity"] * (rainfall - 1))
    factor = max(cfg["minimumYield"], min(cfg["maximumYield"], factor))
    hazard = ("drought" if rainfall < cfg["droughtThreshold"] else
              "flood" if rainfall > cfg["floodThreshold"] else None)
    return ClimateState(month=month, profile=profile, season=cfg["seasons"][index],
                        rainfall=round(rainfall, 4), yieldFactor=round(factor, 4), hazard=hazard)
