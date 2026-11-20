# Coastal phase: headland diffraction and sheltered bays (2026-11-20)

## Scope

This phase adds a **bounded angular wave-diffraction proxy** to the existing
directional surf and finite-depth refraction implementation. Its purpose is to
reduce wave energy in the lee of headlands and inside protected coves, and bend
crest fronts near the transition between open and sheltered water.

This is **not** a solution to the Helmholtz equation, diffraction integrals,
or a spectral wave-action / ray-tracing solver. It does not calculate complex
reflection or harbour resonance.

## Technique

1. Take the incident wave direction from the dominant existing
   `SEA_SWELL_COMPONENTS` carrier. The waves propagate opposite its phase
   gradient, so upstream samples follow the *positive* carrier direction.
2. At fixed world-aligned lattice points, test five angular upstream rays with
   weights `[.12, .22, .32, .22, .12]`. Each ray travels at most 80 metres,
   with early termination on land. Zero new render textures are allocated.
3. Average ray visibility and map it into a minimum-throughput transmission.
   Smoothly interpolate neighbouring global lattice points and fade the shelter
   out between 40 and 90 metres offshore.
4. Multiply the established `seaExposure(shoreDistance)` by that transmission.
   Encode it into the *existing* water-appearance alpha channel.
5. Use the same transmission in water pages and terrain-aware gameplay water
   queries. The CPU cache is scoped to the world, generator, terrain edit and
   base terrain revisions, and resolved diffraction settings. Worker pages
   include tile edits within the lattice and ray reach.
6. Scale nearshore breaker energy, foam, swash surface foam and rock-impact
   water foam by shelter. Add a bounded, carrier-wave-number-scaled phase lag
   to the same phases used by surface displacement and directional breaker
   foam. Existing finite-depth refraction and offshore swell blending remain.
7. Keep inland lakes, rivers, waterfalls and frozen-water appearance unchanged.

All new controls live under `water.sea.surf.diffraction` in
`config/water-visual.yaml`. The resolver defaults this feature to disabled
for existing configurations. Streaming workers receive the validated YAML
settings in each chunk request; they rebuild the field with terrain edits.

## Performance boundaries

- Five rays; eight upstream samples each by default.
- Ocean classification probes use the existing bed-free `sampleWaterSurface`
  query; the original full water/bed query count remains unchanged.
- A 16-metre global lattice, not one ray set per water vertex.
- Hard ray reach cap and finite sampling cache (2,048 lattice points).
- No per-frame GPU occlusion pass, depth capture, extra render-target copy,
  procedural wave mesh, or extra uploaded texture.
- Offshore early exit: no probe work once `shoreDistance >= offshoreFadeEndMeters`.
- No change to underwater optical postprocess, surface-reflection architecture
  or river/lake shaders.

## QA

- Open ocean and unobstructed beaches: original wave energy.
- Behind a synthetic promontory: smaller waves and less foam.
- Cove entrance: smooth partial exposure and curved, lagged crests.
- Paired chunk edges (including negative coordinates): identical encoded
  exposure without seams.
- Terrain edits and base regeneration refresh exposure. Tile edits outside
  the standard surface-mask halo still reach affected diffraction probes.
- Gameplay CPU wave height equals water height query with the same exposure.
- Disabled/legacy behavior, quality tiers, storm behavior and inland water
  unaffected.

```sh
node --test test/sea-diffraction*.test.js test/sea-refraction*.test.js test/sea-surf*.test.js
npm run build
npm run qa:water:acceptance
```

The [persistent swash and rock-impact implementation](coastal-sheltered-swash-rocks-2026-11-20.md)
uses sheltered wave energy in both simulations. The
[analytic swash implementation](coastal-analytic-shelter-2026-11-20.md)
carries shelter into low and medium quality and the high and ultra fallback.
The [coastal review](qa/coastal-review-2026-11-20/README.md) records visual and
performance checks.
