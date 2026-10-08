# Settlement rendering

Azgaar burgs are planned by `src/editor/world/settlements/` (streets, plots,
defences, decor). Until 2026-10-08 nothing drew that plan: a town was the road
tile and its flattened pads. `SettlementView` now draws it.

## Pieces

| Module | Role |
| --- | --- |
| `view/SettlementView.js` | Adopts the settlements near the focus (at most three), spreads their preparation over frames, picks a tier per placement and writes the instance buffers. |
| `view/SettlementSite.js` | One settlement: its dressing, its placements and its paving meshes. |
| `view/SettlementPrototypePool.js` | One instanced renderer set per pooled variant and tier, installed one a frame. |
| `view/SettlementMeshData.js`, `settlementMesh.worker.js`, `SettlementMeshWorkerClient.js` | A variant's workshop geometry as transferable arrays, generated in a worker. |
| `collision/providers/SettlementCollisionProvider.js` | Buildings and heavy street furniture as oriented box colliders. |
| `view/SettlementPlacements.js` | Plan space → canonical world poses. Pure. |
| `paving/SettlementPavingGeometry.js` | Ribbons along streets and a disc for the square, draped on the terrain. Pure. |
| `paving/SettlementPavingMaterial.js` | The paving material, with a border that frays stone by stone. |
| `SettlementStones.js` | Loose stone — guard stones, quarry blocks, field clearance — planned as props. Pure. |
| `view/SettlementStoneMesh.js` | Turns a `@drusniel/procedural-stone` mesh into a pooled part in the town's stone. |
| `surfaces/SettlementDressing.js` | Which CC0 texture sets each settlement wears. Pure. |
| `surfaces/SettlementSurfaceLibrary.js` | Makes those sets on demand, in parallel, reference counted. |
| `surfaces/SettlementProceduralBaker.js` | Generates a set in GPU memory from a Procedural Texture Lab recipe. |

Nothing is stored with the world: plans are derived (`SettlementPlanner`), and so
is everything drawn from them.

## Levels of detail

A pooled house is 15–48 k triangles, so each variant has two tiers. Inside
`nearIn` (70 m) a placement draws the full mesh; beyond `nearOut` it draws the
far tier — for a house its plaster shell, roof and openings, which are material
families of the same mesh and cost no second generation; for masonry the
workshop's shell tier. The two cross-fade by screen dither. Street furniture is
drawn only within `smallRange`. Constants live in `SETTLEMENT_VIEW`.

Generating a variant takes about 0.1 s, so its geometry is made in a worker and
the main thread only installs the result, one variant a frame, nearest first; a
town fills in around the player. Three costs had to go before that stopped
dropping frames (worst frame while a town fills in: 160–250 ms → 44–85 ms):

- generation itself, now in the worker (the pool generates here only if no
  worker exists, or it dies);
- the workshop synthesising a dozen textures per variant that the town's
  surface sets then replace — `createWorkshopMaterials` now skips a family's
  synthesised maps when a set is supplied for it;
- a variant's nine or so new materials all compiling on first draw — new meshes
  are announced to the streamed draw-preparation queue, which compiles a couple
  a frame.

The view takes its turn from the frame's deferred budget and runs anyway after
`starvationFrames`, so a busy frame cannot starve it for good.

## Collision

`SettlementCollisionProvider` is a component of the natural collision provider.
It reads the same derived plans as the view, so what blocks the player is what
is drawn: one oriented box per building over its plot (less the plot margin),
slimmer boxes for masonry, two piers for a gatehouse so the road through it
stays open, and boxes for wells, stalls, carts, barrels, quarry blocks and
boulders. Each solid is owned by the chunk its centre falls in. Lanterns,
benches, fences and the like are left passable. `collision.settlements.enabled`
turns it off.

## Paving

The terrain can only say "road tile" on a 2 m grid. Paving is separate geometry
lifted a few centimetres over it: setts on streets, flags on the square and door
walks, earth on country lanes and in hamlets. Heights are the generator's vertex
heights bilinearly blended — the surface the terrain mesh actually has. Layers
overlap at every junction, so each rides its own lift and polygon offset.

## Dressings and textures

`npm run fetch:settlement-textures` downloads eleven CC0 sets from Poly Haven
and writes them as 512 px WebP under `public/assets/textures/settlement/`
(sources in `THIRD_PARTY_NOTICES.md`). A settlement's id picks its dressing — a
cobble set, a flag set and a timber tone — and its style's roofing picks the roof
set. A town loads only its own seven sets, in parallel, when it comes into range,
and releases them when it leaves; none of it runs at startup.

Building surfaces reach the workshop through
`withWorkshopSurfaceOverrides`, scoped to one generation, so workshop authoring
and baked objects are untouched. Plaster, stone and roof sets are stored neutral:
the wall finish and the per-stone and per-tile vertex colours tint them. (The
workshop's synthesised stone and roof albedos repeat the palette, which
multiplies it in twice and is why un-dressed masonry renders dark.)

### Procedural sets

Some sets are not images but [Procedural Texture Lab](https://github.com/danielsobrado/drusniel-procedural-textures)
recipes: a few kilobytes of `.ptl.json` under `public/assets/materials/settlement/`,
exported from the Lab's presets by `npm run export:ptl-settlement-recipes` (which
needs a Lab checkout; the game does not). The game depends on the PTL runtime
only (`procedural-texture-lab`, installed from git; `vite.config.js` dedupes
`three` so it shares the app's copy).

`SettlementProceduralBaker` compiles a recipe with the runtime's
`ProceduralMaterial`, draws that material's own colour, normal and
AO/roughness/metalness nodes onto an oversized square in **one** MRT pass, and
cross-fades the overshoot back over the opposite edges so the tile repeats. It
never leaves the GPU: the editor runtime does no readback.

Two things were learnt the hard way and must stay:

- The recipe's shader is large. Compiled synchronously it stalls the GPU, and
  the whole game, for seconds per pipeline — three passes froze rendering for
  ~40 s. It is one pass, compiled with `compileAsync`; frames keep flowing.
- A generated set's texels exist only on the GPU. The workshop disposes the
  textures of every material family a building does not use (a wall has no
  roof); that used to re-upload a photographed set unnoticed and wiped a
  generated one for good, leaving walls discarded. Sets are flagged
  `sharedSurface`, and the workshop's three disposers skip that flag.

A town waits for its whole dressing, so only presets that generate quickly
belong in `SETTLEMENT_SURFACE_SETS` (stone 1 s, plaster 4 s; the Lab's cut
cobble took 45 s and is not used). A set that fails to generate falls back to
its role's photographed set.

## Loose stone

Guard stones at house corners, dressed blocks by smithies and warehouses, and
boulders with their scatter at field corners come from
[`@drusniel/procedural-stone`](https://github.com/danielsobrado/drusniel-procedural-stones),
not the workshop. The library returns renderer-neutral arrays in ~20 ms and
~200 triangles a stone; `SettlementStoneMesh` colours them from the town's stone
palette by the library's tone, cavity and moss channels and maps the town's stone
surface set over them, so a boulder by the wall is the wall's stone. They are
planned last, from the same seeded stream, so retuning them never reshuffles a
town. The dependency is a `file:` link to a sibling checkout until the library
is installable from git or npm.

## Not done yet

- Per-instance frustum culling: a variant's instances are drawn as one batch.
- Collision is boxes: a roof cannot be walked on and a doorway cannot be entered.
- Shader pipelines still compile on the main thread, a couple a frame.
