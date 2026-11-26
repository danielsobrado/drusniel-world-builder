# WSC PR 6 — Bidirectional ecological footprints

Captured with `node scripts/run-wsc-pr6-qa.mjs` (embedded, non-watching Vite server;
hardware WebGPU, RTX 4080) at the PR 0 temperate-deciduous cameras, using the same
canopy pose resolution as PR 0 (`findCanopyPose` from B02-C01).

| Shot | Modes |
|---|---|
| B02-C02 trunk close-up | D00, D08 contact, D10 litter, D11 vegetation coverage |
| B02-C03 canopy aerial | D00, D08, D10, D11 |

[pr6-contact-sheet.jpg](pr6-contact-sheet.jpg) rows: C02, C03; columns: D00, D08, D10, D11.

## What changed

- Contact patches round trunks, bushes and stones take the meadow root zone's lobed
  outline at the same per-placement phase (`groundContact/ecologicalFootprint.js`), so
  the duff and the grass gap share one shape instead of a disc under a lobed gap (`DEF-09`).
- Trunks add a wider root-disturbance litter footprint (`forestFloorTexture.b`),
  weighted by the canopy over it (30 % for a lone meadow tree).
- WSC `eco.a` carries the grass a trunk or stone clears (`contactGrassSuppression`).

## Evidence

- Unit gate (`tests/worldSurfaceContextPr6.test.js`): a phased patch differs by > 20/255
  between its wide and narrow lobe at equal distance; iso-values follow the shared lobe in
  every direction; root litter scales to the open-ground share; suppression is monotone.
- C03 D08: open-ground patches between crowns read as irregular soft blobs, not rings.
  Tree meshes cover most of the floor in that view; a trees-hidden top-down D08 would be
  the cleaner gate and is not captured yet.
- Cost: painting 500 trees into one 128 × 128 chunk texture, 1.21 ms (disc) → 1.28 ms
  (lobed, trig-free) + 1.15 ms root-litter pass; CPU only, one chunk per frame, no shader change.

Not in scope: moisture as an ecological channel (the eco texture's four channels are taken).
