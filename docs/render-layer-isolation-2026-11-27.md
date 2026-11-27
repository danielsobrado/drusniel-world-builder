# Rendering-layer isolation

Base: 1ec98055a0896e198603b604820f35c06a52461b. No GitHub Actions.

## Activation

```text
?renderLayerIsolation=1&measuredGpuAdmission=1&farShadowAdmission=1&reflectionAdmission=1
```

The new boolean is independent and defaults off. Enable water reflection and GPU occlusion quality options separately to exercise their paths.

## Design

Explicit producer tags, not name heuristics or broad material transparency rules. Unknown objects fail open. The existing hierarchy registry indexes exclusions during insertion/removal and its existing bounded tag refresh. No full scene discovery on a warm capture. The capture scope hides excluded objects and uses the existing exception-safe restore path.

- Both reflection kinds exclude camera-local ambient particles, breath, GPU snow particles, rain streaks/splashes, and already-tagged spray and waterfall mist. World-space ridge plumes, snow shells, smoke, water banks, buildings, trunks, canopy, rocks, distant grass cards and sky retain existing behavior.
- Cube captures additionally omit fine meadow blades (explicit template classification); planar reflections retain them. This is a trial visual tradeoff, not proven pixel equivalence.
- Hidden detail branches avoid auxiliary selection; visible detail branches and tree impostors retain their independent camera selection.
- Hi-Z skips explicit transient meshes, already-indirect or batched meshes and empty draws before CPU bounds work. Existing solid terrain depth proxies, opaque buildings and other eligible objects remain unchanged.
- Main beauty, near/far shadow caster flags, material graphs and ordinary frustum culling remain unchanged. Shadows already filter noncasters; no unsafe blanket distant-caster removal. Nested shadow maps remain frozen by existing capture scope. No new scene or GPU budget.
- Counters: reflectionLayerExcluded.cube, reflectionLayerExcluded.planar, reflectionHiddenDetailLayersSkipped, occlusionLayerExcluded. Counts are objects excluded, not saved draws or GPU time.

## Limitations / TODO

A reflection can visibly differ where excluded particles or blade silhouettes contribute. Validate calm water, storms, low camera angles and snow before enabling by default. Dynamic late tags may take a bounded registry refresh cycle to be discovered; producers set tags before attaching. Existing capture scheduling, water validity, rebase and shadow freshness are unchanged. This is a targeted reflection/Hi-Z isolation pass, not a complete layer graph: no new shadow-distance policy, underground visibility, or independent water/terrain shader residency changes. TODO: audit cave/portal visibility and per-cascade caster costs with measured evidence. Full npm, lint, build, visual and GPU acceptance pending.

## Verification

```sh
npm ci
node --test test/render-layer-isolation.test.js test/reflection-shadow-registry.test.js test/reflection-capture-schedule.test.js test/water-reflection-residency.test.js test/water-planar-reflection-level.test.js
npm run lint
npm test
npm run build
```

Compare identical headed coastal, rain, alpine, settlement, and underwater routes with flag disabled/enabled. Capture main beauty, cube faces, planar targets and both shadow cascades. Confirm cards remain and planar grass survives; test nested object insertion/reparent/removal and failure recovery. Check GPU timings by named target, depth collection candidates, main and shadow image parity, CPU collection time and P95/P99/P99.9. Verify forced WebGL fallback and standalone captures. No measured savings claimed.
