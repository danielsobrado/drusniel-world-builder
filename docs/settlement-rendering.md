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
  four wall boxes with a 1.5 m gap in the middle of its front, where the plan
  runs its door walk. The mesh has no interior and its door is drawn shut, so
  this is passage, not a furnished room; set the flag false for solid houses.
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
- **Close-up sets.** Building surfaces and street setts are fetched at 1K
  without the painterly median (`CLOSE_UP` in `SettlementDressing`), so a
  wall a stride away shows pitting and grain instead of a smear; the stone
  keeps 75% of its contrast, and `SettlementGrade` strengthens photographed
  normals per family (`RELIEF`). Paving samples its set twice, turned and
  rescaled, blended by noise with a broad tone drift, so a square never shows
  the tile repeat (`SettlementPavingMaterial`). The patterned cobble set was
  dropped: its strips printed a grid across every square.
- **`SettlementGrade`.** Every building material is pulled toward one daylight
  per family, then weathered by `render/materials/townWeathering.js`, the same
  node the medieval kit's towns use: moss on sky-facing ledges and slates, rain
  runs down faces, and a damp foot over the bottom metre. Renders keep 55% of
  their hue and stone 45% (the workshop's finishes are paint-box bright, its
  stone palettes lean teal), bare masonry's joint mortar is darkened below its
  stone, and vertex colours are folded into the graded colour: three applies
  them after `colorNode`, which would undo the grade. The paving's earth layer
  is tinted to `TOWN_GROUND`.
- **Kit parity.** Both town renderers share one material language:
  - plaster dressings use `plaster-painted` and masonry-finished houses are
    walled in `stone-rubble` (the `rubble` role), the kit's own scans; one
    dressing paves with the kit's setts (`cobble-kit`);
  - `SettlementGrade` grades each family toward the kit's hue at its own
    brightness (`KIT_HUE`: warm grey stone, cream render, dark brown timber)
    and turns the workshop's brass fittings to forged iron;
  - window recesses are leaded glass (`SettlementDusk`): diamond quarries from
    the recess face's position (it has no UVs), each quarry its own piece of
    crown glass, glossy, faintly lit by day and warm at dusk;
  - wooden trim (shop signs) wears the town's timber set under aged paint, and
    awning canvas is stained and sun-bleached in the shader;
  - stone keeps half of its style's own hue (granite cool, sandstone warm) and
    terracotta roofs are tinted the kit's weathered orange clay;
  - ivy is woody stems with pointed leaves in mixed greens, not a sheet of
    same-coloured squares.
- **Night.** `settlementDusk` is 1 on a night look (`skyLooks.night`), since a
  moonlit preset keeps its "sun" high and the sky alone never read as dusk;
  windows burn with the same firelight (`#ff9a3d`) as the kit's glass.
- **Paving.** Squares are laid in `flag-monastery` (irregular old flags with
  deep joints) and some lanes in `cobble-old`; joints are darkened in the
  colour from each set's occlusion map, since three's AO map only touches
  ambient light and sunlit setts read as one flat sheet. Grime and the
  untiling sample are shared with the kit's cobbles (`treadPaving`).
- **Sky.** The configured day sky has fewer, larger, softer cumulus
  (`cloudScale` 6.5, `cloudSharpness` 0.24) over a hazier blue; cloud bodies
  are shaded from their own density, with no second noise sample (a sunward
  sample looked the same and cost 0.4 ms of a full-screen sky).
- **Ground bounce.** Inside a town the sky light's ground colour is drawn from
  the look's meadow green to trodden earth (`SettlementGroundBounce`, kit towns
  too). Green bounce turned every face out of the sun teal.
- **Soft ground edges.** Paving is cut by a world-fixed grain as well as by the
  surface's joints, so layers thin out into grass and into each other over a
  metre. Aprons carry no darkening of their own; the shade layer does that.

## Doors and rooms

`scripts/generate-settlement-doors.mjs` measures where the workshop puts each
pooled house's main door, and how far the wall's stones stand proud there, into
`SettlementDoors.generated.js` (`npm run check:settlement-doors` fails if it is
stale). From that one table:

- the recipe names that door `openDoorId`, and the workshop builds it as a clear
  void with its frame, dressings and step but no leaf (`buildDoor`). It used to
  shrink the door with a component transform, which shrank the opening too and
  filled every doorway with stone;
- `SettlementRoomDressing` furnishes each room: a plank floor, a stone base
  course, corner posts and ceiling joists, a hearth set forward of the shell's
  inner stones (`HEARTH_INSET`; against the room line it was buried in them)
  with logs, emissive embers and flames, a bed, a shelf of crockery, a cask,
  a trestle table with a planked top and a splay-legged bench clear of the
  doorway's walk line, a stool by the fire, a posted bed and a chest
  (`SettlementFurniture`, built from chamfered boxes in `SettlementRoomParts`).
  It stays in the one interior mesh a town (about 2600 vertices a room, no
  shadows), so it costs no draw calls;
- `SettlementInteriorMesh` shades that mesh: each vertex carries
  `interiorSurface` [wood, firelight] (`SettlementInteriorSurface`). Wood takes
  the town's timber set through a box projection once its dressing loads
  (one recompile a town); each hearth's stone glows with its fire after dark;
- `SettlementInteriorGeometry` draws, as one mesh a town, each room and its
  doorway's reveals, timber frame, and boarded, iron-strapped leaf standing open;
- the collider's walls and doorway come from the same `houseShell`.

The doorway is a real opening: the furnished room shows through it, and its
hearth glows after dark.

Sun and moonlight fall through each room's ground-floor windows as leaded
patches on the floor and walls (`SettlementWindowLight`), a light cookie
computed in the interior shader rather than lit:

- `scripts/generate-settlement-doors.mjs` also records every pooled house's
  ground-floor windows (`SettlementWindows.generated.js`); the planner hands
  them to the building as `windows`, and the interior builder writes one row a
  room into a small float table (6 windows a room at most).
- Each interior fragment traces toward the sky's key light (`settlementSunlight`,
  set by `SettlementView` from the sky every frame, so the moon takes over at
  night) and asks whether the ray leaves through a window opening and through
  glass rather than lead. The patch softens with distance from the window.
- No lights, no shadow passes, no extra draws: still one interior mesh a town.
  The room is lifted by the sky's fill light no real room gets, so the patch is
  brightened (`COOKIE_GAIN`) to stand out as a sunbeam does. The table's `x` is in the footprint's frame, which is
the mesh's −x once placed (`scripts/generate-settlement-doors.mjs`).

## Loading without the long frames

New meshes are compiled before they are shown: `SettlementPrototypePool`
hands each to `renderer.compileAsync` (three at once), and only then reveals it,
two a frame. Worst frame while a town fills in: 60–94 ms in one measured run,
from 123–182 ms.

## Not done yet

- Window light ignores cloud shadow and other houses in the way; lanterns cast no cookie.
- Animals amble on the spot; they do not graze, flee or path.
- The skyline is unlit massing; from flat ground forest hides it.
- Procedural paving waits on a layered bake in the texture library.
