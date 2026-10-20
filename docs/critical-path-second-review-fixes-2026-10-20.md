# Second critical-path review — fixes and validation

The supplied review inspected `d7dd7e02`. Its five settlement findings describe
real paths, and the simulation persistence/history concerns are valid API
limitations. Production simulation data loss was not established: there are no
current `src` callers of `createSimulationWorld` outside its own module; its
consumers are simulation tests. Durable storage is now available for integration.

Implementation commits on `main`:

- `da9dfb55`: cached settlement registry, isolated worker lane, retries,
  deferred skylines and readiness.
- `6424cdc2`: persistent simulation saves and bounded archived command history.
- `b90ca912`: compatibility for injected stores, transaction rejection handling,
  local resident lookup and deterministic work-count runner.
- `6538a755`: actual tree-atlas rebake for the current snow sources.
- `d9aca888` / `f5033e73`: explicit unavailable-browser-storage errors, paused-clock
  behavior and opaque transaction IDs for injected stores.

**Full production verification passes. Hardware frame pacing and two-second
scenery recovery remain unverified**, following the user's instruction to finish
without further foreground timing runs. No biome IDs, density, LOD distances,
geometry detail or visual quality settings were reduced.

## Settlement initialization and worker capacity

Browser imports now precompute the immutable settlement registry in the existing
import worker and retain it with the source. Coastline relocation and spatial
bucket membership use the same canonical `SettlementField` algorithm. Plans
and mutable plan indices are excluded from the cache. Its derived-cache version
and source key invalidate it after relevant seed, elevation, scale, bounds,
river, route or settlement changes. Coastline/profile algorithm changes must
bump the registry version.

First use of a valid cache constructs a small field wrapper. Buckets and mutable
plan entries hydrate on local access, without rebuilding the whole registry.
Resident lookup uses the ID index. Explicit complete enumeration remains
available for diagnostics and standalone callers. Uncached documents encountered
by the settlement view request the registry asynchronously and block readiness
until it is installed; world/revision changes discard late results.

The synchronous terrain/collision APIs retain canonical fallback behavior. A
direct caller of `ensureSettlementField()` on an uncached older source can still
perform synchronous construction; this change does not claim that all legacy
loading, terrain sampling or collision preparation is now asynchronous. New
imports avoid that registry cost through their saved cache.

Settlement registry and plan requests now use one lazily created worker separate
from the existing terrain pool. Eight skyline requests therefore cannot consume
the terrain workers, including when the terrain pool contains only one worker.
World configuration, cancellation, errors and disposal propagate to this lane.
It adds one worker; it does not reserve a physical CPU core or prove OS scheduling
latency. Terrain jobs may still generate plans they themselves need for canonical
grading and masks.

Transient failures marked `retryable` recover in place, with at most three
attempts and backoff of 250 ms then 500 ms. Duplicate requests are suppressed.
Registry and plan owners preserve epoch protection through retries and eviction.
Malformed results, schema mismatches and ordinary index-construction errors stay
terminal and visible in readiness. An explicitly retryable installation failure
can retry; deterministic corruption cannot loop indefinitely.

## Skyline preparation and QA readiness

The settlement worker produces the existing massing positions, colors, indices,
normals and bounding sphere alongside the plan. Palette constants moved to a
shared pure module without changing their values or public material exports.
Transported typed arrays become buffer attributes directly. Main-thread
installation yields between attribute/index/mesh steps and stages material
preparation through `stagedDrawPublication`; it no longer traverses buildings or
computes normals and bounds in `refresh()`.

Skyline readiness reports expected, installed, pending and failed counts. Missing
plan data, exhausted installation budget, shader preparation and failed jobs all
prevent a settlement/scenery readiness pass. Eviction cancels unpublished jobs
and releases their geometry. Staged and installed meshes follow the floating
origin. Tests cover three distant towns, suspended work, shader waiting,
cancellation and exact geometry/normal/bounds equivalence.

GPU allocation/upload for a complete skyline remains indivisible. The shared
preparation mechanism stages it; only hardware profiling can establish its frame
cost.

## Simulation save and history policy

`createSimulationWorld({ campaign, saveStore })` accepts an injected store. Browser
instances default to IndexedDB, scoped by world ID; non-browser fixtures keep the
explicit in-memory backend. Storage failure is reported, with no silent fallback
from a failed browser write to volatile memory.

The IndexedDB adapter retains `beginSave`, `commitSave`, `abortSave`, `save`, `load`
and `list`. Pending payloads are checksummed. Updating the committed save and
removing its pending record occur in one transaction. A crash or aborted commit
preserves the prior committed save. Rejected begins cannot commit an unrelated
pending transaction. Payload checksums, existing snapshot checksums, strict schema
restoration and staged runtime validation remain in effect before live state is
replaced. No snapshot-schema migration bypass was introduced.

Persistence configuration now controls:

| Setting | Default | Purpose |
| --- | ---: | --- |
| `journalSegmentCommands` | 256 | Commands per immutable archived segment |
| `maxPendingJournalSegments` | 4 | Maximum outstanding archive/checkpoint jobs |
| `maximumCommandsBetweenSnapshots` | 100,000 | Interval between replay checkpoints |
| `maximumReasonLogEntries` | 2,048 | Routine diagnostic reason window |

Archives retain every accepted command in order. Routine saves contain a bounded
resident tail and constant-size archive-chain metadata; they do not clone all old
commands. Completed segment payloads leave the runtime. Archive/checkpoint records
remain in storage for historical replay; automatic deletion of old replay records
was not added. Routine reason logs intentionally retain only the configured recent
window.

The resident command backlog is bounded by
`journalSegmentCommands × (maxPendingJournalSegments + 1)`; it is 1,280 commands at
the defaults. When storage cannot keep up, synchronous dispatch/batches reject
with `history_archive_backpressure` before mutation. Time advancement checks
capacity before moving the clock, so daily/monthly commands are not silently
omitted. Failed archive payloads remain owned and can retry. Larger synchronous
bulk replay can also return backpressure without replacing the live world.

Use these APIs for longer operations:

```js
await world.stepDaysAsync(365);
await world.flushHistory();
for await (const command of world.readJournal()) {
  // Complete accepted-command history, streamed from archives and the tail.
}
await target.replayJournalFromSnapshot(initialSnapshot, world.readJournal());
```

`getJournal()` returns the resident tail; `readJournal()` returns complete
history. `getHistoryStatus()` exposes resident/archived/pending counts, checkpoint
identity and archive errors. Replay adopts isolated state only after success.
Custom stores can implement `putArchive`/`getArchive`; older injected interfaces
continue to work through reserved `__replay_archive__:` transactional slots.
Those slots can appear in a custom store's own listing. The IndexedDB adapter
keeps archives in their own store.

This bounds command/reason bookkeeping, not every simulation collection. The
authoritative world, existing audit ledger and other saved systems can grow;
whole-campaign save size and serialization are not claimed to be constant. Replay
checkpoints contain canonical snapshots for replay, not a replacement for the
complete runtime save payload.

## Evidence and production verification

The same deterministic workloads compared frozen `d7dd7e02` with the resulting
runtime. These are work counts and correctness checks, not frame-time samples.

| Workload | Before | After |
| --- | ---: | ---: |
| 1,000 source burgs, first-use coastline probes | 32,675 on caller | 0 on caller; 32,675 during preparation |
| Valid registry entries / entries hydrated by a local query | 926 / 926 | 926 / 21 |
| Eight plan requests: terrain workers occupied by those requests | 8 | 0 |
| Critical terrain request dispatched immediately | No | Yes |
| 268-building skyline: buildings massed on main | 268 | 0 |
| Skyline vertices | 7,100 | 7,100 |
| One injected transient worker failure | Permanently pending | Recovers on second request |

Raw results:
[settlement-preparation-work-2026-10-20.json](research/settlement-preparation-work-2026-10-20.json).
Reproduce with an archived source directory, without a branch or worktree:

```bash
mkdir -p tmp/critical-path-second-baseline
git archive d7dd7e02 src | tar -x -C tmp/critical-path-second-baseline
node scripts/measure-settlement-preparation-work.mjs tmp/critical-path-second-baseline
```

A real headless Chromium worker fixture requested eight plans, transferred a
registry and skyline arrays, and confirmed all eight plans matched the canonical
generator. A terrain request dispatched immediately while seven city requests
waited in the separate lane. This fixture ran on frozen `6424cdc2`; the worker and
registry sources are byte-identical at `f5033e73`, with hashes retained in
[settlement-worker-browser-qa-2026-10-20.json](research/settlement-worker-browser-qa-2026-10-20.json).

Actual IndexedDB checks on frozen `f5033e73` closed Chromium completely and
reopened its temporary profile. Exact state and snapshot checksums survived.
Default browser persistence, namespace isolation, interrupted saves, overlapping
transactions, injected commit abort/retry, archived command order, bounded
diagnostics and corrupt-load isolation all passed with zero browser errors.
The browser used no GPU. Result:
[simulation-indexeddb-qa-2026-10-20.json](research/simulation-indexeddb-qa-2026-10-20.json).
Reproduce with `node scripts/run-simulation-persistence-qa.mjs`.

The 1,000-command unit soak verifies bounded resident bookkeeping, complete
archived order, streamed replay, replay checkpoints and resumed state. Fault
tests verify backpressure, unchanged state/time on rejection, retained failed
archives, retry, old save preservation and injected-store compatibility.

The stale tree atlas was actually rebaked in native Windows Chromium, encoded
with `toktx v4.4.2`, and validated against the current source inputs. No provenance
override was used. All 29 prototypes pass production atlas validation.

`npm run verify` passed on **`f5033e73`**: lint, generated UI consistency, all
production asset validators, **6,941 tests with zero failures/skips**, and the
production build. The existing large-bundle advisory remains. Compact record:
[critical-path-second-verification-2026-10-20.json](research/critical-path-second-verification-2026-10-20.json).

The headed hardware movement/density/construction/water/settlement matrix,
foreground CPU profiles and two-second full scenery recovery remain release
requirements. They were not run or claimed here. Keep the current settling,
focus, density, collision, coverage and frame gates unchanged.
