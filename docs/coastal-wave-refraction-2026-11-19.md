# Coastal wave refraction — implementation notes

The ocean uses the existing distance-to-shore and semantic water depth to bend
nearshore directional breakers around headlands, islets, and curved beaches.
This is a bounded, shallow-water Snell approximation, **not** a ray-traced
eikonal or diffraction solver.

## Implementation

- `SeaRefractionMath.js` supplies the CPU reference and precomputed carrier
  constants. `SeaRefractionNodes.js` implements the same equations with TSL.
- `SeaSurfMath.js` and `SeaSurfNodes.js` add the correction to the *same*
  carrier phases used by wave heights and breaking foam. The GPU correction is
  evaluated as a vertex varying rather than independently per foam pixel.
- The preexisting phase still follows the shoreline-distance contours, which
  bend naturally around headlands. Dispersion shortens the local wavelength
  and the conserved tangential wave number decreases the incidence angle.
- At the configured reference depth the phase correction is exactly zero.
  Far offshore it fades out before the ordinary swell replaces the breakers.
  It is bounded at the waterline and over very broad shallow shelves.
- All spatial calculations use existing local depth and shoreline distance;
  no canonical-position float32 math, extra textures, or render passes.
- The default resolver keeps refraction off for older callers. Shipped
  `config/water-visual.yaml` enables it for directional ocean surf.

The approximation uses `k ≈ k_ref sqrt(tanh(k0 h_ref) / tanh(k0 h))`, with
`k_n = sqrt(k²-k_t²)` and `k_t` conserved. The correction is
`(k_n-k_n_ref) * s/(1+s/s_max) * strength * depthFade`.
This preserves time-phase and foam alignment but does not solve arbitrary
lateral bathymetric gradients.

## QA acceptance

1. Curved beaches and headlands: breaking crests follow the coastal contours,
   compress as the water shoals, and do not visibly fold.
2. Straight beaches: directional sets still run landward at their original
   temporal frequencies; break onset and shore foam stay attached.
3. Offshore: a calm/storm open-sea view remains unchanged beyond the blend.
4. Inland: lake, river, frozen water and waterfall waves are unaffected.
5. Seams: identical coast/depth inputs at adjacent chunk boundaries give
   identical phase offsets, even at ±9 million metre canonical coordinates.
6. No new material, texture, compute pass, or per-frame CPU bathymetry rebuild.

Focused checks:
```bash
node --test test/sea-refraction.test.js test/sea-refraction-nodes.test.js test/sea-surf.test.js test/sea-surf-nodes.test.js
npm run build
npm run qa:water:acceptance
```

Visual captures and GPU frame timings still require a WebGPU-equipped browser
and should not be inferred from CPU reference tests. A future diffraction phase
can add sheltering and wave-energy gradients in coves.
