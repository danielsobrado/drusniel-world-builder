# Closed location structural partitioning and GPU residency

Base: 935a7c7199f16971999c5826957fcbbc121754a4. No GitHub Actions.

Activate `?locationStructureStreaming=1`. Existing surface/instance scene isolation stays unchanged. Closed locations without sky or authored reflectors only.

- Terrain switches from 28 m XZ columns to configurable 3D cells. Whole triangles and baked attributes are preserved; actual bounds include cross-boundary triangles.
- Large opaque non-indexed static prop batches are partitioned after lighting and prop occlusion bake. Transparent, animated, displaced, special, small or unsupported batches retain the old path. Potential draw count increases in exchange for finer frustum rejection.
- Pinned Three r187 WebGPU samples section bounds every 250 ms. Near (56 m from sphere) or visible sections are protected. After five seconds without protection, dispose at most two initialized geometries per sample. The Geometries manager releases attribute buffers and recreates them on later rendering. CPU arrays and visibility remain intact.
- Surface and instance scenes already render separately; surface residency remains retained for return. Navigation unchanged.
- Counters: locationStructure.sections/resident/protected and cumulative locationStructure.evictions.

## Limits / TODO

Full density generation, full-site bake and CPU geometry memory remain eager. Reupload on fast turns may hitch; the protection ring and idle timer are trial values. Portal/room occlusion is not implemented: existing links are site transitions, not validated intra-site visibility portals. TODO: validated portal visibility, prefetch/sliced GPU initialization, CPU bake streaming, safe surface eviction/reentry. No measured savings claimed.

## Verification

Run npm ci, node --test test/location-structure-streaming.test.js test/stonehold-locations.test.js test/location-extra-props.test.js, npm run lint, npm test and npm run build. Compare mine, cavern city, ice cave, open approaches and reflective throne with flag off/on. Inspect floor/ceiling seams, lighting, navigation, rapid turns, teleports, entry/exit, geometry buffer allocation and disposal, memory and P95/P99. Force WebGL: partitioning remains, GPU retirement disabled. Full browser/hardware validation pending.
