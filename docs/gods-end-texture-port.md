# Gods End texture port

Ported on 2026-10-04 from `/home/drusniel/drusniel-gods-end`.
The world builder has no runtime dependency on that checkout.

## Runtime integration

| Source texture | World builder consumer |
| --- | --- |
| Village stone, dark stone, plaster, timber, planks, deck, clay tiles, slate, leaded glass | Shared object-catalog surfaces and nine Workshop presets labeled **Village …** |
| Green, yellow and pale falling leaves | `FallingLeaves`, one mipmapped texture array with three layers |
| Packed sea slopes, height and second moment | `SeaSurfaceShading`, shared by water materials at the same choppiness |
| Snow007C albedo, GL normal and packed AO/roughness/height | Terrain snow detail, shared by all terrain materials |
| River/lake detail | Existing `RiverSurfaceShading` port retained |
| Waterfall strands and spray puffs | Existing ports retained; verified against the donor at its native resolution |
| Serpent scales and body patterns | Existing `serpentSkin` port retained |

In the Workshop, select a material area, open **More…**, and choose a
**Village …** preset. Overrides and custom variants persist through the existing
semantic material document. Defaults for existing Workshop assets are unchanged.
The presets compensate for the Workshop's existing 0.58 UV density; repeat and
rotation remain editable. Their texture transforms are owned by the material,
while pixel data is shared with the object catalog.

`src/editor/assets/godsEnd/textures.js` also exposes the donor's standalone grass
billboard atlas and boundary-barrier noise generators. The current meadow has its
own multi-shape atlas and the infinite world has no boundary-barrier renderer, so
these factories are available without replacing those systems. The grass factory
requires a browser canvas. The exported factories return caller-owned textures;
`acquireSnowTextures` instead returns a reference-counted lease.

Snow007C is **image-based**, not procedurally generated. The three original 1K
maps and their CC0 provenance are in `public/assets/textures/snow/`. Snow detail
varies the existing color, roughness and view-space terrain normal. It preserves
the existing snow classification, accumulation, glints and deformation. The
snow shader and sea texture coordinates use repeating, bounded positions so
chunk boundaries and floating-origin shifts do not reset the pattern. This is a
texture port, not a replacement of the donor's entire terrain or water renderer.

Authored tree artwork, baked impostors, imported ground images, terrain data
fields, interaction/deformation buffers and GPU render targets are not procedural
surface texture generators and are not duplicated by this port.

## Ownership and cost

- Village maps retain the donor's 128/256/512 resolutions, seeds and pixel math.
  They are generated once per catalog kind and reused, including Workshop maps.
- Albedo is sRGB; normals, roughness and packed water/snow data are linear.
- The nine village map pairs use about 13.5 MiB with full mip chains if all are
  requested. The three-layer leaf array is about 1 MiB; sea detail is about
  1.33 MiB per active choppiness; the snow set is about 16 MiB.
- Leaf material disposal releases the array. Sea and snow leases release their
  textures after the last owning material. Snow remains neutral until all maps
  load and stays neutral if a request fails.
- Existing stone-piece geometry and terrain IDs are unaffected. No per-frame
  texture synthesis or new viewport copies were introduced.

## Validation

```sh
node --test test/gods-end-textures.test.js test/gods-end-workshop-textures.test.js
npm run build

# With Vite already serving; uses headed Chromium and requires WebGPU.
node scripts/run-procedural-texture-qa.mjs --url http://localhost:5173/
```

The browser fixture is also accessible at
`http://localhost:5173/scripts/qa/procedural-textures.html`. It draws the village
surfaces, grass atlas, falling-leaf array, sea detail and snow detail. Its report
and screenshot are written to `tmp/procedural-texture-qa/`. On WSL, run the script
with native Windows Node/Playwright for the hardware adapter, as described in
`perf-qa.md`.

Validation for this port:

- Exact donor pixel fingerprints for all nine albedo/normal pairs, all three
  leaf palettes, sea detail, barrier noise, waterfall strands and spray puffs.
- Preset save/load and actual generated Workshop material selection.
- Texture sharing, transform isolation, disposal, failed snow loads and completion
  after disposal.
- 62 focused texture, material, Workshop, foliage and water tests passed.
- Production build passed.
- Headed WebGPU texture fixture passed without shader or resource errors.

The deterministic `chunk-cross --warmup 8 --duration 12 --settle` baseline reached
an NVIDIA Lovelace adapter but timed out. Another movement-performance run was
active in the shared workspace, so no valid before/after frame-time comparison
is claimed. Re-run the movement harness in an exclusive GPU session before
accepting performance numbers for this port.
