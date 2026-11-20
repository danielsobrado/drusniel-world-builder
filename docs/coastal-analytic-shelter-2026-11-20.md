# Coastal phase: sheltered analytic swash on every quality tier

Date: 2026-11-20

## Goal

Unify the **analytic shoreline fallback** with the previously implemented
headland/cove diffraction and sheltered persistent swash. Low/medium tiers
never allocate GPU persistent swash; high/ultra tiers retain analytic fallback
when compute is inactive. Both should now bend and weaken beach waves.

## Implementation

- Use the **existing per-chunk water appearance RGBA8 texture**. Its alpha
  already holds exposure `seaExposure(shoreDistance) * diffractionTransmission`
  for ocean texels, with no extra data generation or texture upload.
- Extend `createTerrainWaterContext` with an *optional* sheltered-surf read.
  It reuses the existing per-object water slot and `bilinearLoad`, which
  performs four sampler-free texture loads. **No new texture or sampler**.
- Decode ocean IDs at each texel *before* interpolating exposure; normalize
  the result by the existing interpolated ocean coverage. This avoids
  attenuation artifacts across wet/dry texel boundaries and excludes lakes.
- Divide by the open-coast exposure factor to isolate the **transmission**
  (clamped to 0..1). With no water, the neutral factor is 1.
- Compile the extra reads only when
  `water.sea.surf.diffraction.enabled` and the directional surf model
  are active. At runtime, perform them only within the water's nearby
  coastal height band.
- The height band expands with configured `water.coast.runupHeight` to
  support unusually tall configured breakers without extending work on
  standard beaches.
- Feed the same **transmission T** into the already shared
  `coastSwashForcingNodes`:
  - maximum run-up is proportional to `T`;
  - the crest phase is offset by `(T - 1) * k0 * phaseLagMeters`;
  - foam coverage and natural swash memory respond to the shorter front;
  - baseline damp sand remains (it should not disappear in a sheltered cove).
- Pass the same diffraction config to the water-side swash graph so analytic
  waves stay aligned across the sand/water boundary and match high/ultra
  persistent simulation when it is not active.

No new quality-tier settings: the existing
`config/water-visual.yaml:water.sea.surf.diffraction` controls all effects.

## Backwards compatibility

With diffraction disabled, `createTerrainWaterContext` returns a constant
shelter of 1 and does not build the extra water-appearance reads. Its previous
`ocean`, `organic`, `cold`, `wet` and `damp` fields are unchanged.
The existing persistent-swash compute and rock-impact systems are untouched.

## Cost and follow-up

This **does** add approximately four extra sampler-free appearance texture
loads to the analytic terrain shader near eligible coastal water when the
feature is enabled. It allocates zero additional texture/sampler bindings and
zero new passes. The loads are conditional on a wet render slot and the
coastal height band. GPU timing should verify the impact on dense coastline
scenes; the single read of the existing appearance alpha is deliberately
separate from the existing identity/tint read to preserve all four legacy
material-context values.

## Validation

```sh
node --test test/coastal-analytic-shelter.test.js test/coastal-shelter-*.test.js test/sea-diffraction*.test.js test/coastal-swash.test.js
npm run build
npm run qa:water:acceptance
```

Acceptance:
1. With the existing YAML enabled, open beaches have unchanged swash amplitude.
2. Low and medium tiers show shorter crests and less foam behind headlands.
3. High and ultra tiers retain matching water/ground shoreline phase whenever
   persistent simulation is inactive, without a visible transition.
4. Ocean coast seams and floating-origin transitions are stable; lakes and
   inland riverbanks remain unaffected.
5. Disabling diffraction removes all added terrain texture loads.
6. GPU sampler count remains unchanged.

TODO: Run real WebGPU screenshots and profile frame time on exposed beaches
and sheltered coves across low, medium, high and ultra quality tiers.
