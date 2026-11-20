# Coastal phase: sheltered swash, backwash, rock impacts, and spray

Implemented on top of coastal diffraction and finite-depth wave refraction.

## Design

No new GPU texture, render pass, simulation, global state, or shoreline-classification
method is introduced. The existing `water.sea.surf.diffraction` YAML settings
remain the single source for headland transmission and phase lag.

### Persistent beach swash (WebGPU high/ultra)

- `CoastalSwashInputs` builds a new surface-only, world-aligned diffraction sampler
  when its camera window moves or the terrain revision changes. As before, it
  samples canonical ocean classification, not terrain color or procedural noise.
- The **previously unused alpha channel** of the current RGBA16F coastline input
  now contains local transmission `T`, between `minimumTransmission` and 1.
  Every noneligible texel and every disabled case stores exactly 1.
- `CoastalSwashField` reads that channel in the existing compute pass:
  - Wave run-up: `H_runup = H_config * T`.
  - Crest phase: `phase += (T - 1) * k0 * phaseLagMeters`.
  - Front velocity: derivative of the reduced front range.
  - Uprush/backwash transport: existing coast-normal velocities derived from
    the reduced front speed. Lateral advection is multiplied by `T`.
  - Newly injected mobile foam is multiplied by `T` before transport,
    deposition, wash-off, and decay.
  - Natural damp sand baseline remains; old wetness and stranded foam decay
    under their existing independent lifetimes.
- The pure CPU foam-step reference accepts optional `shelter` (default 1).
  Its existing behavior remains unchanged when diffraction is disabled.

### Coastal rocks and spray

- Rock candidate scans read the **same cached** `sampleWorldStoreSeaExposure`
  as gameplay water queries at the selected ocean-side contact probe.
- `impactWaveSample` accepts optional absolute wave exposure; it now adds
  finite-depth refraction and diffraction phase offsets to the same dominant
  directional carrier that drives the ocean waves. The overload defaults to
  the legacy `seaExposure` behavior.
- Lower exposure reduces incident crest height and breaker intensity **before**
  impact intensity and the minimum-impact threshold are tested.
- The existing impact event supplies attenuated intensity to rock foam,
  lasting rock wetness, runoff, and spray particle count/velocity/mist.
  Nothing is rescaled a second time at particle emission.
- A terrain revision refreshes candidates and resets obsolete rock-contact
  history, droplets, and state.

### Water-shader double counting

The persistent swash and rock-impact simulations attenuate foam at its source.
The analytic swash path uses the same transmission for run-up, phase and foam
strength. Both mount their result on the existing shoreline blend.

## Boundaries and performance

- Water field and game-wave queries are unchanged except for their shared
  shelter lookup, introduced in the previous coastal phase.
- Swash reuses its existing 4-channel input and its existing two compute
  passes, with no change in resolution, update rate, or state memory.
- Diffraction probes only run during shoreline-input rebuilds, not per frame;
  the sampler caches its global 16 m lattice and uses the bed-free ocean
  surface query.
- Rock lookups run on candidate scans, not for every spray particle.
- The low/medium and fallback [analytic terrain swash](coastal-analytic-shelter-2026-11-20.md)
  reads shelter from the existing water-appearance texture. It adds no sampler.

## Acceptance and follow-up

1. Exposed beach: same swash reach, foam production, and backwash speed.
2. Lee beach: shorter run-up, slower retreat, lower foam injection, but
   damp sand and foam memory retain natural decay.
3. Windward rock: impact foam, wetness, spray and mist still appear.
4. Sheltered rock: weaker impact intensity and fewer/no spray events.
5. Straight coast, curved coast, distant world, and floating-origin moves:
   no seams or phase discontinuities.
6. Terrain edit: swash transmission and rock candidates respond to the
   new coastline and do not preserve obsolete particle state.
7. Lakes/rivers and disabled diffraction: unchanged.
8. Validate WebGPU compute graph compilation and real GPU frame timings.

```bash
node --test test/coastal-shelter-*.test.js test/coastal-swash.test.js test/coastal-rock-impact.test.js test/sea-diffraction*.test.js
npm run build
npm run qa:water:acceptance
```

The [coastal review](qa/coastal-review-2026-11-20/README.md) records hardware
WebGPU captures, timings and outstanding visual limitations.
