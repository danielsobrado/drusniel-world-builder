# WSC PR 8 — Shared environmental coatings (2026-11-27)

Captured with `node scripts/run-wsc-pr8-qa.mjs` (shared frozen-server harness; hardware
WebGPU, RTX 4080) from a clean export of `main` at `207ab467`: B17 snow-to-rock on the WSC
fixture (wide and one boulder's foot), B03 rainforest floor and B02 trunks, in D00 lit, D01
albedo, D22 moss coat coverage and D23 snow coat coverage.

[pr8-contact-sheet.jpg](pr8-contact-sheet.jpg) rows: B17 wide, B17 rock foot, B03, B02;
columns D00, D01, D22, D23.

## What changed

- **One coverage contract.** Every surface that lays a coat records the masks it actually uses
  (`surfaceCoatings/CoatCoverage.js`: `publishCoatCoverage(material, { moss, snow, wet })`):
  authored rocks, alpine crags and their snow caps, trunks, deadwood, the town kit, workshop
  houses, settlement snow, and the terrain's baked snow. Coverage is kept in a WeakMap, not
  `userData` (which `clone()` deep-copies through JSON into dead objects); clone sites pass it on
  with `inheritCoatCoverage`.
- **D22 is full, D23 is real.** Both draw each surface's published coverage in a clone of its own
  material, unlit; a surface with no such coat reads neutral purple. D22 was "moss eligibility
  (approximate)" (up-facing × canopy) and supported only in part.
- **One moss pigment** (`surfaceCoatings.moss.palette`): rocks, trunks and deadwood each had
  their own (fixed constants, the grass palette, and `#5e7f2f`/`#8fae4b`).
- **Coats, not colour mixes**, on deadwood moss and on trunk and deadwood snow (Snow007C grain,
  roughness and normals in the object's own frame).

## Evidence

- D22/D23 resolve per surface: B17 rocks carry their real snow on caps and ledges in D23 and
  near-zero moss in D22; the terrain shows its baked snow in D23 and no moss coat in D22.
- Unit gate `tests/worldSurfaceContextPr8.test.js`: publication merges layers and refuses
  non-nodes; every coated surface publishes what it lays; a plain clone carries no coverage and an
  inherited clone keeps the same node; the palette is shared, validated, and no material keeps
  one of its own.

## B17 snow collar

[b17-before-after.jpg](b17-before-after.jpg) (left before, right after; top a boulder's foot,
bottom the wide view). The thin uniform white rim at every boulder's foot is gone: snow banks
against the stones and caps their ledges. That result combines this session's taller,
wind-swung drift with a clinging band above it (`snowDeposition.js`) and another agent's
concurrent snow-cap geometry, crevice-filled snow and cool contact AO
(`snow/RockSnowCap*`, `rockSnowSurface.js`, `rockWeathering.js`), which landed in the same
window.

## Not covered

- B03 and B02 at these cameras show no logs or mossy stones up close, so the moss coat on
  deadwood is gated by tests here, not by a capture.
- Mud/dust as a shared coat is not unified: dust stays per surface (rocks, towns).
- The boulder snow apron's outer rim can read as a raised ring at a close grazing view
  (B17 rock foot); it belongs to the snow-cap geometry work.
