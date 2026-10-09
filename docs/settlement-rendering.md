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
  are held back and shown two a frame (`SettlementPrototypePool.reveal`). They
  are deliberately kept out of the streamed draw-preparation queue: it runs only
  on spare frame time and hides what it has not reached, and on a frame slower
  than `exploration.frameBudget.targetFps` it has none, which hid whole towns.

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
only (`procedural-texture-lab`, pinned to a pushed commit on GitHub; `vite.config.js` dedupes
`three` so it shares the app's copy).

`SettlementProceduralBaker` compiles a recipe with the runtime's
`ProceduralMaterial` and bakes its stack **a layer a pass** (`bakeStaged`) onto
an oversized square: each pass adds one layer to accumulators read back from
the last, and the final pass applies the stack's finishing terms and writes
colour, normal and AO/roughness/metalness. The overshoot is then cross-faded
back over the opposite edges so the tile repeats. It never leaves the GPU: the
editor runtime does no readback.

Two things were learnt the hard way and must stay:

- A whole stack as one shader compiles far slower than its layers do apart:
  the Lab's cut cobble (nine layers) took 45 s as one pass and takes 3–4 s
  staged; its gravel went from 21 s to 2 s. Every pass is compiled with
  `compileAsync` — a synchronous compile stalls the GPU, and the game with it.
  Staging needs `createSurfaceNodes(…, stage)` from the runtime; without it the
  baker falls back to one pass.
- A generated set's texels exist only on the GPU. The workshop disposes the
  textures of every material family a building does not use (a wall has no
  roof); that used to re-upload a photographed set unnoticed and wiped a
  generated one for good, leaving walls discarded. Sets are flagged
  `sharedSurface`, and the workshop's three disposers skip that flag.

A town waits for its whole dressing, so a set must generate in seconds; staged,
the three in use take 2–4 s each. One dressing (`old-market`) is paved with the
generated cut cobble and gravel. They are plainer than the photographed setts —
the Lab's presets carry their detail in relief, not colour — so the other five
dressings keep photographs. A set that fails to generate falls back to its
role's photographed set.

## Loose stone

Guard stones at house corners, dressed blocks by smithies and warehouses, and
boulders with their scatter at field corners come from
[`@drusniel/procedural-stone`](https://github.com/danielsobrado/drusniel-procedural-stones),
not the workshop. The library returns renderer-neutral arrays in ~20 ms and
~200 triangles a stone; `SettlementStoneMesh` colours them from the town's stone
palette by the library's tone, cavity and moss channels and maps the town's stone
surface set over them, so a boulder by the wall is the wall's stone. They are
planned last, from the same seeded stream, so retuning them never reshuffles a
town. The dependency is pinned to a pushed commit on GitHub.

## Layout, life and light

- **Districts** (`SettlementPlots.planDistricts`): towns and larger give sectors
  a character — a quay where a port meets its water, a wealthy quarter toward
  the keep, craftsmen along the road left over — each with its own building mix.
- **Ports** (`SettlementStreets.waterBearing`) get a quay road first, toward the
  nearest unbuildable ground.
- **Walls** (`SettlementDefences.wallLine`) follow three slow waves, only ever
  outward of the town, with lengths laid by distance along the line.
- **Aprons**: bare trodden earth round every footprint, tucked under the wall.
- **Variation**: a stable shade per placement over the pooled mesh; barrels and
  crates by the doors of trade.
- **Culling**: placements outside the camera frustum (plus a shadow margin) are
  not drawn; the visible set is re-chosen when the camera turns.
- **Skyline** (`SettlementSkyline`): a box and a gable per building, one mesh a
  town, shown beyond 560 m out to 3.2 km.
- **Residents** stand at `SettlementGathering` spots — stalls, well, benches,
  trade doors, main streets — up to 14 a town.
- **Dusk** (`SettlementDusk`): one uniform from the sky's sun height and key
  light; window recesses glow in most houses and lantern glass burns. Emissive
  only — no lights. **Smoke** (`SettlementSmoke`) is one instanced sprite draw a
  town, animated entirely in the shader.
- **Art direction**: photographed colour maps get a median pass and a little
  saturation at fetch time, so paving sits with the painted vegetation.
- **Wall tops** are walkable colliders at the wall-walk's own height.

## Trim, shade, sound and ways in

- **Trim** (`SettlementTrim`, `view/SettlementTrimMesh`): hanging signs and
  striped awnings on places of trade, ivy patches on some house walls, sheep in
  some fields and hens by farmsteads — small vertex-coloured meshes the view
  builds itself, pooled like loose stone (`SettlementCraftedKinds`). Every third
  wall length and the keep are the workshop's own overgrown (`ivy`) variants.
- **Ground shade** (`addShade`, `createShadeMaterial`): the ambient occlusion a
  building casts on the ground, as a dark ring that overlaps in alleys. One
  transparent draw a town; there is no screen-space pass.
- **Haze** (`createSettlementHaze`): faint drifting discs along main and ring
  streets and over the square, thicker and warmer at dusk.
- **Sound** (`audio/settlement_ambience.js`): a synthesised murmur that swells
  toward the middle of the nearest town, louder for bigger towns and quiet at
  night, and an anvil ringing in runs within 70 m of a smithy by day.
- **Doorways**: with `collision.settlements.enterable` (default on) a house is
  wall boxes round its measured room with a gap at its door, and the room is
  furnished (see Doors and rooms); set the flag false for solid houses.
- **Wall stairs**: one wall length in seven carries a flight on its inner face.
  The mesh has twenty steps; the collider ten treads, because the character
  motor only stands on a box wider than the capsule.

Two collision facts this work turned up, both easy to get wrong again:

- A box collider's `dimensions` are full extents. The first version passed half
  extents and every building blocked half its footprint.
- `boxTopSupport` used to hold a character only within a quarter radius of a
  box's edge, while a capsule pressed against the box stands a full radius off
  it, so nothing could be walked up onto. `BOX_LEDGE_REACH` is now just over
  one radius; this applies to every walkable box, not only settlements.

## One town, one look

After the glade wall work in `construction/`: quiet faces, and let bevels and
joint shadow do the drawing.

- **Coursed masonry.** Settlement recipes use `irregularity: 0.14`. At the
  workshop default (0.45) every stone is turned, skewed and pushed out of its
  course, which across a street reads as blocks jostling.
- **Quiet stone.** The stone set is flattened to 40% of its contrast at fetch
  time (`contrast` in `SETTLEMENT_SURFACE_SETS`); the two procedural stone
  fields were dropped as too blotchy for dressed masonry.
- **`SettlementGrade`.** Every building material is pulled toward one warm
  daylight per family, and washed toward `TOWN_GROUND` over its bottom 1.5 m.
  The paving's earth layer is tinted to the same `TOWN_GROUND`, so a wall rises
  out of its ground instead of meeting it in a line.
- **Soft ground edges.** Paving is cut by a world-fixed grain as well as by the
  surface's joints, so layers thin out into grass and into each other over a
  metre. Aprons carry no darkening of their own; the shade layer does that.

## Doors and rooms

`scripts/generate-settlement-doors.mjs` measures where the workshop puts each
pooled house's main door, and how far the wall's stones stand proud there, into
`SettlementDoors.generated.js` (`npm run check:settlement-doors` fails if it is
stale). From that one table:

- the recipe shrinks and sinks the drawn door leaf — the only transform the
  workshop allows a door (`buildingRecipe`, `openDoor`);
- `SettlementInteriorGeometry` draws, as one mesh a town, an open doorway on the
  stone face (dark opening, frame, leaf standing open) and a room behind it;
- the collider's walls and doorway come from the same `houseShell`.

The shell's masonry is unbroken behind its door, so the doorway cannot be seen
through: from the street it is a shadowed opening, from inside a bright one.

The same script grows, from just inside each door, the largest rectangle of
floor that no part of the house stands in (`room`), and finds the lowest face
of the house over it (`ceiling`) — by face, not vertex: an upper floor is one
slab whose corners all lie outside the room. The room the view draws and the
collider's walls are both that box, so a room fits inside its shell instead of
having the shell's stones standing in it or its upper floor hiding the beams.

### What a room is

A northern fantasy hall in small: firelit, timber and stone, dark in the
corners. Four modules under `view/interior/`, each with one job:

- `RoomPlan` (pure data, no three) decides what stands where by the building's
  trade — a stone hearth with its pot, firewood and a shield over the mantel in
  a dwelling, with bed, chest, table, rug, banner and stored goods; benches,
  counter, casks, antlers and a wheel of candles in a tavern; shelves and a
  counter in a shop; pews and an altar in a chapel; an anvil in a smithy — and
  lists the room's lights. Pieces too big to walk through carry a `solid` box,
  which `SettlementCollisionProvider` turns into colliders, and the strip
  inside the door is kept clear.
- `InteriorBuilder` gathers a town's rooms into one mesh per material and bakes
  each room's light into its vertices: `fire` (hearth, candles, sconces — warm,
  RGB) and `sky` (door and windows). Large faces are cut into 1.1 m cells so
  light falls off across them. Rooms get no real lights and no sun.
- `RoomFurnitureMesh` draws each piece; `SettlementInteriorGeometry` the shell
  round them: plank floor, joists under boards, and walls framed in timber
  (posts, rails, knee braces) over a stone base course.
- `InteriorMeshes` makes the materials. Wood, plaster and stone are the town's
  own surface sets under a vertex tint, unlit, multiplied by ambient + fire ×
  flicker + sky × day-or-night (`settlementDusk`), so a room is warmest and
  most itself after dark.

Things to keep when changing this:

- The footprint frame is a mirror image of settlement-local space. A face wound
  to look along its normal there is back-facing here; `InteriorBuilder` flips
  for it and a test checks every triangle. Getting this wrong does not look
  like a winding bug — the room vanishes and the shell's masonry shows instead.
- Keep light pools tight (`radius` in `RoomPlan.lightsOf`). With a long reach
  every wall is evenly lit and the room turns beige and flat.
- Flames are drawn at their own brightness (`glow`); keep them at or under 1 or
  they burn out to white under the scene's tone mapping.
- A chandelier hangs 0.95 m below the ceiling, so it is only planned at 2.85 m
  and over. Measured taverns are lower than that today and are lit by sconces.

## Loading without the long frames

New meshes are compiled before they are shown: `SettlementPrototypePool`
hands each to `renderer.compileAsync` (three at once), and only then reveals it,
two a frame. Worst frame while a town fills in: 60–94 ms in one measured run,
from 123–182 ms.

## Not done yet

- Rooms are flat-coloured boxes: furniture is unlit by its hearth, has no
  colliders, and the windows are painted light, not openings.
- Animals amble on the spot; they do not graze, flee or path.
- The skyline is unlit massing; from flat ground forest hides it.
