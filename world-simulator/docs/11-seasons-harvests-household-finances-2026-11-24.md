# PR10 — Seasons, harvests, household finances and validation

Implementation is split across PR10A–PR10E in world-simulator. Every curve and
financial parameter is an authored assumption, not calibrated historical evidence.

## PR10A — Regional climate
- `simulation/climate.py` uses each Azgaar biome, the frozen scenario rules,
  scenario seed and month index to derive deterministic seasonal yield and rainfall.
- `config/simulation.yaml` configures biome profiles, seasonality and thresholds.
- Existing scenarios without these rules retain neutral climate behavior.
- Climate is saved per settlement; migrations handle older state schemas.

## PR10B — Food production and storage
- Food growing and rural surplus use seasonal yield factors.
- Granary losses remove physical rations from inventory and are included in
  the production conservation flow.
- Severe weather and low yields can generate canonical `harvest-shortfall` events.
- `FoodBalance` records yield factor and monthly spoiled rations.

## PR10C — Household economic aggregates
- A configurable three-tier budget model tracks wages, food affordability,
  savings and unpaid housing expenses in copper.
- This is a **household-level analytical model**, distinct from the Azgaar
  settlement treasury. Employers do not yet debit wages from their own accounts.
- It does not create or destroy physical rations and does not alter observed
  food consumption; access denotes *affordability*, not actual intake.
- It is not yet a globally balanced monetary ledger; migration does not transfer
  individual household assets across settlements.
- Old frozen scenarios without household rules retain an empty finance model.

## PR10D — Causal economic effects
- Two consecutive months of inadequate modeled food affordability record
  `household-hardship`; recovery records `hardship-relieved`.
- Scarcity and affordability change migration appeal and bandit recruitment.
- Biography context and NPC concerns refer only to the settlement-level
  affordability situation, not invented individual household debts.
- A statistical association is not recorded as a direct historical cause.

## PR10E — Workbench and validation
- Economy workspace shows climate, growing conditions, spoilage, household
  affordability, savings and arrears.
- Validation Lab checks finite/nonnegative ranges and supplies aggregate metrics.
- Add backend and frontend regression tests for new contracts and scenarios.

## Compatibility and limitations
- All state changes are versioned and scenario rules are frozen.
- Save/load and snapshot migrations follow existing versioned paths.
- The seasons and finance model require calibration before full-world realism claims.
- Weather events are generated at settlement/month scale, not hourly weather.
- Agricultural output models a seasonal staple supply, not individual planted crops.
- Financial tiers are population aggregates, not balances of named NPC households.
- Automated GitHub Actions are not used.
