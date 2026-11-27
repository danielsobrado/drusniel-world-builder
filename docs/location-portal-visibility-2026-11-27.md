# Closed cave portal visibility

Base: b77192837f77a6c7b84ac4566a9e1af1ee41d2d4. No GitHub Actions.

## Activation

Audit (no visibility or residency changes):

```text
?locationStructureStreaming=1&locationPortalVisibility=1
```

Experimental culling:

```text
?locationStructureStreaming=1&locationPortalVisibility=1&locationPortalCull=1
```

Add locationStructurePrefetch=1 to evaluate interaction with predictive uploads. Both portal switches default off. Eligible closed opaque, unsmoothed terrain only; open sites, ice, authored reflectors and locations with the existing postprocessing path retain the old behavior.

## Implementation

The graph is derived from the final density grid rather than from authored site transition links. Cells are aligned to source voxels with a target size of 12 m. A shared face is considered potentially open if its padded slab contains a nonnegative density value. The two-voxel margin covers neighboring surface-net cells; uncertain and grazing cases are treated as open. A whole face is the conservative portal aperture, not a fitted doorway. Construction stops and returns no graph if the 8192-cell or eight-million-sample-read budget is exceeded.

A runtime flood starts from all cells touching the camera near-plane safety volume. It traverses portals intersecting the four lateral camera frustum planes. It does not clip by the near or far planes and does not narrow the frustum through successive portals. This trades rejection power for safety. Another flood without frustum tests provides connectivity for prefetch. Static structural mesh bounding boxes are mapped to every intersected cell, including both sides of a boundary. Unknown bounds are never culled.

Audit mode reports candidates but never changes visible flags, prefetch or eviction. Culling mode only owns visible flags it changed. Unsupported cameras, outside/solid camera positions and changed mesh transforms restore owned visibility. Updates run before each location render, not on the slower residency sampling clock. Culling mode rejects prefetch candidates in disconnected graph components and permits normal idle eviction of portal-hidden geometry outside the near protection region. A queued prefetch can remain active until the next residency sample. Geometry that becomes visible uses normal first-draw behavior.

## Diagnostics

locationPortal.cells, locationPortal.portals, locationPortal.reachableCells, locationPortal.rejectedSections, locationPortal.hiddenSections. Zero hidden sections is expected in audit mode. Compare graph build time, per-frame CPU cost, draw calls, triangles, residency, uploads and frame tails on identical routes.

## Validation

```sh
npm ci
node --test test/location-portal-visibility.test.js test/location-structure-streaming.test.js test/location-structure-prefetch.test.js
npm run lint
npm test
npm run build
```

Compare flags off, audit and culling on the same SHA. Verify Mine and Cavern City closed opaque sites if eligible; verify ice, reflective and open sites remain unchanged. Capture straight tunnels, sharp corners, vertical shafts, chamber boundaries, intersecting tunnels, narrow apertures, near-plane wall crossings, rapid turns, teleports, entry/exit and cold revisits. Test camera clipping, geometry transforms, nonresident meshes and no persistent missing surfaces. Reject any visual difference caused by false culling or higher frame tails. Compare audit rejected counts to actual culling and measure portal build overhead separately.

Tests are committed, not executed in this environment. Hardware acceptance remains pending.

## Limitations

This is conservative coarse portal reachability, not exact doorway clipping, mesh occlusion or a precomputed visibility set. Broad faces and coarse cells can keep many occluded chambers visible. The graph relies on the closed unsmoothed surface-net terrain assumption; culling must remain opt-in until image comparisons verify it for authored sites. No changes to collision, lighting, material generation, shadows, transparency or decorative geometry. No strict runtime CPU deadline; graph size is bounded, but two floods and mesh checks per frame may cost more than saved draws in smaller caves.

TODO: measure and cache connectivity by seed set, introduce tighter validated portal apertures, and implement incremental generation and baking separately.
