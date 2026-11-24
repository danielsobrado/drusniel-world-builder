# 10 — Correctness hardening (PR9A)

This PR fixes the concrete findings of the 2026-11-23 code review before the simulation
grows further. Each fix has its own deterministic test in `tests/test_correctness.py`.

| Finding | Fix |
|---|---|
| A child born in the month its parents married was looked up in the households from before the marriage, and the lookup failed | `births()` reads the month's working household list. A named child also comes at least `people.pregnancyMonths` (9) after the marriage, and after the mother's previous child. |
| Ages assumed a 360-day year | `complete()` gives the people rules `daysPerMonth` and `daysPerYear` from the scenario's **frozen** calendar. Ages, age bands, reconstructed pasts, kinship, hooks and the consistency checks all use it. `advance` and `baseline_state` complete whatever rules they are given; for rules already completed this changes nothing. |
| Event dates and labels used the current YAML calendar | The manager dates events, and the labeller labels days, with the scenario's frozen calendar |
| Migration moved idle adults only, while named moves took whole households | Children follow their adults in the origin town's proportion, and elders stay. A named household with an elder stays too, so the named moves and the aggregate counts agree. |
| Rumours reached the market innkeepers when a caravan departed | A caravan picks up its home town's public news when it leaves (`Caravan.news`, schema v7). On arrival, the centre's innkeepers hear it from the master, and the master hears the centre's news. Nothing arrives before the caravan does. |
| Market purchases could drive a treasury below zero | A town buys at most its treasury, plus this month's sales, plus `market.credit` (0). Food comes first, and other goods scale down alike. |
| Named outlaws used only a settlement's first route | A town holds all its routes, with outlaws counted per route. A new outlaw joins the band with the most room. Today each settlement has exactly one route, so outcomes do not change; a second road no longer breaks it. |
| Finding an event's consequences scanned every event body | An indexed `causes` table. Older archives are backfilled once when opened (`PRAGMA user_version`). |

## Also fixed: snapshots across schema versions

A snapshot used to be verified by hashing the state **after** loading it into the current
models. A new field, even one with a default, changed that hash, so every existing
snapshot looked corrupt after any schema change, and older-schema snapshots were refused
outright. Now the state is verified as it was **stored**, then migrated, so snapshots
survive schema bumps. Schema v7 is the first bump to rely on this.

## Frozen rules and replays

Scenarios keep running under the rules they were created with:
- **New settings:** `pregnancyMonths` and `market.credit` sit inside sections that older
  frozen rules already hold, so those scenarios get no spacing and no purchase limit, exactly
  as they ran.
- **Changed code:** fixes to the code itself (the household lookup, migration, rumour timing)
  apply to every scenario's future steps.
- **Replays:** a replay is exact for the simulator version that recorded the journal.

## Not in PR9A

**Distance-aware migration** is still missing: the review's migration finding (lowest
unemployment, wherever it is) needs travel through actual roads and sea lanes, with
departure and arrival dates. That is PR9B, geographic transport, migration and information
propagation.
