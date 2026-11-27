# Incremental underground lighting bake

Base: 354967d16ceb2653ca9a53030430b0a8b53205f0. No GitHub Actions.

## Activation

```text
?locationStructureStreaming=1&locationIncrementalLighting=1
?locationStructureStreaming=1&locationIncrementalGeneration=1&locationIncrementalLighting=1
```

Lighting is separately opt-in. It uses asynchronous surface preparation even if incremental generation is not explicitly enabled, avoiding a synchronous extraction inside the lighting scheduler. The generation worker settings still apply. Open, sky-lit and authored-reflector sites keep the conventional build path.

```yaml
locationStructureBudget:
  lightingEnabled: false
  lightingSliceMs: 4
```

## Implementation

The synchronous APIs drain the same generators that the optional cooperative path advances. Direct light (including raymarched absorption, structural contact AO, thickness, seam metrics and per-vertex jitter) yields every 16 vertices. Global bounce emitter construction yields while accumulating vertices and bins; bounce gathering yields every eight receiving vertices. Preserve source order, global vertex IDs, floating-point accumulation order and complete field dependencies. No independently lit chunks or boundary approximations.

The builder keeps a single private group until all stages finish. Terrain classification, gain, AO/seam copying and smoothing, prop sample caching, prop direct/indirect lighting and mesh publication have cooperative checkpoints. The complete prop occlusion grid exists before direct lighting; all terrain direct light exists before bounce construction; props gather from the same terrain bounce field. Smoothing still operates over the complete indexed mesh before partitioning. Existing materials, navigation, geometry and light formulas are unchanged.

The scheduler uses a 4 ms cooperative target and yields to a browser task, not a microtask. It checks the location's AbortSignal before each iterator advance. On cancellation or failure, close the iterator and dispose merged and staged geometry still owned by the builder. The scene is not activated until the complete build returns. Counters locationLighting.yields and locationLighting.buildMs cover cooperative build scheduling, including wait time.

## Validation

```sh
npm ci
node --test test/location-incremental-lighting.test.js test/location-surface-preparation.test.js
npm run lint
npm test
npm run build
```

Five new tests cover direct bake, bounce, smoothing, cancellation and config. Compare old/new arrays using identical site/seed, including ice, prop contact AO and large indirect-bounce rooms. Compare flags off vs lighting enabled, same resolution and browser. Record loading duration, longest main-thread task, frame pacing of loading UI, peak CPU memory, mesh hashes and screenshots. Cancel during terrain direct bake, bounce construction, prop bake and staged mesh creation. Check no stale scene activation and no retained staged geometries.

## Limitations

This is cooperative main-thread work, not parallel or worker lighting. The slice target is not a strict latency cap: individual ray batches, occlusion-grid construction, ice smoothing, large merges, partitioning and decoration generation can still block. Total entry time may rise due to scheduling. Full density generation and complete lighting remain prerequisites to entering the location. No progressive section publication, independent chunk lighting or total memory cap. Hardware and visual acceptance remain required. Keep off by default.

TODO: profile and slice the remaining heavy operations, then design a serializable classifier/occlusion contract for worker baking. Complete ordered density operations and entry-prioritized publication separately.
