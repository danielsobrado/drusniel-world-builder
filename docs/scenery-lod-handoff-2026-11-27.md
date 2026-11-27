# Readiness-gated scenery LOD publication

Starting main: 09209efc85a6664f40530509a6c287e733eec6de. No GitHub Actions.

## Activation

Use both existing experimental features (streamed draw preparation and the shared deferred-work budget must be enabled):

```text
?initialInstanceUploadSlicing=1&regionalInstancePublicationBudget=1
?initialInstanceUploadSlicing=1&slicedInstancePublication=1&rendererAdmissionBudget=1&spatialPerformanceOverlay=1
```

Both flags remain off by default. First-use slicing alone retains its previous behavior when no staged scenery publication is attached. The validated YAML setting `initialInstanceUploadBudget.handoffTimeoutMs` defaults to 2000 ms.

## Contract

- Collect positive-count replacements of previously empty geometry pools during the existing CPU-only InstancePublicationPlan. Trees (near, proxy, fallback geometry, canopy and understory), rocks and bushes share this writer. No old counts, rows, anchors, fades or manifests are changed by preparation.
- Before shared upload admission or GPU copy staging, acquire an existing streamed draw preparation job for one replacement at a time per publication. Zero-count meshes stay hidden in gameplay; the existing isolated zero-geometry pass temporarily enables them to prepare the actual renderer context and restore visibility/count. Detached geometry staging shares its existing upload and allocation limits.
- Wait for each current material's existing readiness contract, including its conventional bypass behavior. Then publish the existing atomic CPU/GPU instance transaction. No separate visibility writer, duplicate live mesh, independent upload queue or renderer-wide traversal.
- Cancellation of the generator releases the outstanding lease; its owned pending job is canceled if the mesh is still empty and no explicit material request owns it. Shared requests are reference counted. Completed warm buffers remain normally owned by Three and follow existing idle eviction.
- One deadline covers all replacements within each publication. Timeout releases the current lease and falls back to the previous publication behavior, including normal first-use hiding and registration. This avoids permanently retaining a stale scene when preparation cannot progress. Focus/revision/prototype cancellation continues to be owned by StagedViewRebuild.
- Counters: sceneryLodHandoffDeferred, sceneryLodHandoffDrawsReady, sceneryLodHandoffTimeouts, sceneryLodHandoffAbandonedDraws. Existing upload counters remain authoritative.

## Limitations

The old published view is retained as a whole, not a per-tree transition. Its fades are frozen during preparation; the next publication uses the already computed LOD plan. This is not a guarantee of continuous visibility for newly entered chunks, capacity drops, ordinary culling, timeout, material replacement during later upload staging, device failure or shader bypass. Geometry prewarm uploads the empty pool's current arrays; actual instance rows still need the normal publication, preferably the existing resident slicing path. This may increase total upload bytes and residency duration; no strict global bound on retained resident resources is introduced. GPU/CPU impostor record/compute preparation, auxiliary batches, rock snow-cap synchronization, ground details, settlements and caves are not gated by this change. TODO: extend the readiness contract to those producers and measure retained geometry memory, fade latency and first-use spikes.

## Verification

```sh
npm ci
node --test test/instance-lod-handoff.test.js test/initial-instance-preparation.test.js test/scenery-instance-publication.test.js test/sliced-instance-publication.test.js test/staged-geometry-uploads.test.js
npm run lint
npm test
npm run build
```

Run identical headed WebGPU routes with both flags off, initial slicing alone, staged publication alone, and the combined configuration. Capture an untouched forest/rock/bush region, approach and retreat across LOD boundaries, rapid direction changes, teleport/focus cancellation, origin rebase and idle retirement. Include constrained shared upload budgets and a low handoff timeout. Confirm old instances remain visible while eligible replacements prepare, zero-count targets never render in gameplay early, no stale publication after cancellation, no stranded jobs, no leaked detached storage, and no shader or GPU validation errors. Compare first visit and revisit P95/P99/P99.9, maximum frame time, host/GPU upload bytes, draw counts, residency and time-to-visible. Inspect the timeout counter and visual holes before enabling by default. WebGL and disabled-path behavior must remain unchanged.

Local full npm/browser validation is pending.
