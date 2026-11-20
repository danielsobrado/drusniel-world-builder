# Coastal review findings

The runtime fixes and capture runner are in [`5dd5cbf5`](https://github.com/danielsobrado/drusniel-world-builder/commit/5dd5cbf53821c113708a97f77fa5e97a95f1a385). The screenshot manifest records exact source snapshots for the retained images.

## Fixed

- **CPU shelter after a base terrain replacement.** The CPU ray lattice previously survived a base terrain change with an unchanged ordinary edit revision. The regression reproduced exposure of 0.0900625 after an obstacle was removed, where the open-water value was 0.409375. The cache now uses world identity, generator identity, both terrain revisions, and the resolved diffraction settings. A repeat query with stable state retains its cached ray probes.
- **Worker shelter after a distant tile edit.** A painted headland could block rays reaching farther than the surface-mask halo while the rendered page held its old exposure. Worker tile overrides and their edit signatures now cover the ray reach plus one lattice spacing. The terrain view refreshes resident pages over that same reach. Sculpt-only height edits keep the existing halo. A regression paints and erases a headland outside the old halo and reads the encoded exposure through the worker-backed page path.
- **Persistent fallback with absent or legacy surf setup.** Swash internals passed an absent diffraction object into a strict configuration resolver. They now use its disabled default. Persistent swash also rechecks activation after terrain revisions and clock rewinds. A disabled or legacy surf model leaves worker diffraction off.
- **WebGPU coastal foliage validation.** The overhead headland exposed bush, flower and dune-oat pipelines using 17 interstage variables on a device created with the default limit of 16. The NVIDIA adapter offers 28. The renderer's existing negotiation now requests up to 24, capped by the adapter. The report retains the original validation error and the repeated scene check.
- **Spray uploads during idle draws.** Three.js uploads a `DynamicDrawUsage` attribute every time it processes the draw, even when its version is unchanged. The beach trace recorded about 2.5 MB of spray-attribute writes over one impact. Spray position, velocity and style now use versioned uploads. Emission and an origin change still update the buffers, and the GPU still animates each particle between writes.
- **Coastal test failures.** An exposed wave now returns an exact zero phase delay. The ocean-optics shader contract now checks coverage through the refraction LOD blend introduced before this review. An unused terrain shader import was removed to restore lint.

## CPU and GPU consistency

The directional waves share carrier constants, finite-depth refraction and diffraction lag in the CPU height query and vertex shader. The worker texture holds quantized exposure. The manifest compares it with CPU exposure and carries the nearest texture vertex, so small RGBA8 rounding and sampling differences are visible. Canonical Z is reversed once at the cell conversion. Pattern phases wrap around each chunk's origin. The water tests cover signed chunk borders, origin rebasing and planet-scale positions.

Analytic swash reads reconstructed transmission from the existing water appearance texture on terrain. The water uses the same phase and run-up forcing. Persistent swash uses transmission at foam injection, and rock impacts apply it before the crest and intensity gate. Standing foam and spray use their existing quality policies. Thus low quality can still show terrain wetness and analytic swash while omitting the main directional water shading and water foam.

The dry-side draw mask and interpolated water coverage fade vertex displacement at the rendered edge. The CPU query samples canonical water directly. The swash clock drives the shared shoreline front. It models run-up and decay separately from the three directional breaker carriers. Rock timing follows the dominant carrier and the selected water-side contact.

## Limits

- **Medium visual severity.** The curved shore and the low beach show angular bands at the shallow shelf. The curved band survives the separate screen-space optical-refraction control. The reproduction is the same curved-coast camera and water clock. A follow-up can compare the bathymetry mesh and the depth-based color transition independently.
- The edited water field uses the generator's existing shoreline-distance model for base ocean samples. Painted barriers update direct visibility and coverage. A separate editable distance field would be needed to move all phase and distance contours with large painted or erased coastlines.
- The vegetation fix uses adapter-provided headroom. Hardware limited to 16 interstage variables still needs a smaller foliage shader graph for the affected materials.
- Finite-depth refraction bends local crest phase through a bounded depth approximation. It does not model spectral transport, reflected waves, or cove resonance.

## Visual observations

- The headland's windward and lee probes recorded CPU transmission of 1.000 and 0.224. The nearest rendered appearance texels recorded 0.998 and 0.226. The overhead comparison shows the transition on one continuous shoreline.
- The cove's two water-appearance probes read transmission of 0.230 and 0.248 on all four tiers. Low and medium used the analytic response with no compute dispatches. High and ultra initialized persistent swash in the cove with 840 and 2,580 eligible input texels, respectively. The high headland camera used the analytic fallback because its swash window contained no eligible shore.
- The main cove control keeps its surface detail with shelter enabled. The difference in foam and shading is easier to inspect against the fixed-angle diffraction-off frame. The stills show the waterline and foam distribution at one clock phase and the rock sequence adds a separate decay sample.
- The rocky-shore pair uses a storm to trigger spray from the existing rocks. High and ultra captured the same visible impact at water time 130.433 s. The impact PNGs were taken 0.100 s later with 20 live droplets in the scene. The decay PNGs were taken at 131.033 s with 4 live droplets.
- Two initial medium captures displayed the in-game inventory and were discarded during visual review. The capture runner now blocks keyboard shortcuts in its own QA page and verifies that gameplay overlays are closed. The medium retakes passed the same camera and asset checks.
