# Playable towns

Azgaar burgs become walkable towns built from the medieval kit.

This is opt-in: open the editor with `?towns=kit` (`src/editor/towns/townMode.js`).
By default `SettlementView` draws burgs (docs/settlement-rendering.md). With the
kit on, it is disabled and its settlement colliders give way to the towns' own,
because both draw houses on the same plots.

## Pipeline

1. **Kit (Blender).** `tools/blender/medieval_town_kit` builds 88 snap-together
   modules and 70 building prefabs in three regional families, and exports:
   - `public/assets/environment/medieval-kit/medieval_kit.glb`: one node per module.
   - `medieval_kit_prefabs.json`: per prefab, its module placements, collision
     boxes, doors (hinge, closed yaw, open yaw) and lights, in glTF space
     (Y up, front +Z, origin at the footprint centre).

   - `medieval_kit_lod1.glb`: the same modules from the light far kit, without
     textures.

   GLBs are git-ignored. Regenerate both with
   `blender -b --factory-startup --python tools/blender/medieval_town_kit/build_kit.py -- --no-render`
   and then `... build_kit.py -- --lod1`.
2. **Plans (existing).** `src/editor/world/settlements` plans each burg
   deterministically: streets, plots by kind/variant, pads, props and farm fields.
   The terrain already grades those pads and paints the streets.
3. **Towns (`src/editor/towns`).**
   - `TownPrefabCatalog`: maps plan kinds and variants to prefabs, and the burg's
     culture style to a family: `granite-slate` is Nordic, `limestone-slate` is
     Tudor, and `*-terracotta` is Med.
   - `TownLayout`: pure. Turns a plan into instance transforms, canonical
     collision boxes, doors, lights and interior volumes.
   - `TownStreamer`: queries `generator.settlementsNear` around the view. It loads
     towns within 650 m (one per frame) and unloads them past 900 m.
   - `TownKitAssets`: loads both kits and repacks them. Each module becomes
     one opaque geometry plus its glass (`TownKitGeometry`). Every vertex
     names its kit material, and all kit textures go into two array textures
     (`TownKitAtlas`). So a module costs one draw, not one per material: in
     Wyle that took the scene from about 550 draws to about 400.
   - `TownKitMaterial` (TSL) is the one opaque material.
     - Its per-material tables come from `TownKitSurfaces`.
     - Relief comes from stronger normal maps, crevices darkened from the
       normal maps, and parallax on stone, slate and cobbles.
     - Each house varies its render tone, timber and roof. The seed comes from
       `layout.partSeeds` and reaches the shader as `instanceColor`.
     - Noise in town space wears render back to stone, adds moss and drifts
       the tone.
     - Frost towns get snow; banners and awnings sway in the world wind.
     - A few centimetres of wobble keep lines from looking ruler-straight.
       Shadow passes skip it.
     - `towns.shading` exposes the albedo lift, saturation, crevice depth and
       relief knobs for live tuning (`tmp/town-grade-tune.mjs`).
   - `TownGlassMaterial`: windows glow more as the sun drops, and the sky's
     night flag counts as night. A hash per window instance leaves about one
     window in three dark at night.
   - `TownMesh`: InstancedMeshes per module and level of detail
     (`TownModuleInstances`). Interior modules (floors, stairs, furniture,
     flagged `kit_interior` by the kit) draw only within 36 m of the viewer.
     The town re-picks them every 6 m of movement, using the same meshes, so
     this adds no draws. Door leaves are separate instances.
   - `TownLod`: a town draws the full kit while the viewer is within 100 m of its
     edge (±20 m hysteresis) and the far kit beyond. The far kit borrows the near
     kit's materials by name, and modules it does not make at least 20% lighter
     get no far level. The switch is per town on purpose: a near ring plus far
     remainder drew both kits at once (+230 draws in Wyle) and lost ~15 fps,
     while all-near versus all-far differed by only ~4%.
   - `TownMaterialPalette`: regional looks from shared textures. Stone is tinted
     per style, plaster per finish, Nordic roofs get wood shingles, and hamlets
     get thatch.
   - `TownDoors` and `TownInteractionPrompt`: **E** opens or closes the nearest
     door within 2.4 m. An opening door drops its collider at once; a closing
     door restores it only once it is shut.
   - `TownInteriorAtmosphere`: switches the god rays to `volumetric` while you
     are inside, and restores your setting on exit. Glass is translucent and
     casts no shadow, so sun shafts pass through windows. A pool of 4 warm point
     lights follows the nearest lanterns and hearths.
4. **Collision.** `TownCollisionSource` is a singleton keyed by owner chunk.
   `TownCollisionProvider` is registered as the `towns` component. Walls,
   floors, stair treads and closed doors are solid boxes, and toggling a door
   refreshes only its chunk.

The kit loads lazily when the first town comes into range. It never blocks
startup.

## Different maps

- **In game:** every burg gets its own plan. Its size class comes from
  population, its landmarks from Azgaar flags (walls, citadel, temple, port),
  and its family from culture.
- **In Blender:** `build_kit.py -- --seed 11 --family Nordic` generates a new
  terraced town map: banded terraces, stairs, a crowned chapel, plots with
  street frontage, and a plaza with a well and stalls. It writes
  `medieval_town_<family>_<seed>.glb` and a preview image.

## QA

- `node --test test/towns/`
- In the browser, `window.__editor.towns` exposes `streamer.stats`,
  `doors.focused` and `streamer.towns` (dev only).

## Look and city skins

- **Kit detail** (tuned against a storybook-town reference in Blender over the
  Blender MCP socket; previews render with the game's lights and three's exact
  ACES curve, `medkit/game_look.py`):
  - Narrow Tudor and Nordic houses are gable-fronted: the ridge runs front to
    back, so a full gable faces the street.
  - Tudor manors, large taverns and wide townhouses get a corbelled corner
    turret.
  - Many chimneys climb the gable wall as stone stacks.
  - Upper windows may become oriel bays or get balconies.
  - Shops hang trade signs (key, boot, mug).
  - Gables carry turned spikes; towers and chapels carry weathervanes.
  - Common houses and townhouses also come one story taller (`<Family>_<Base>_Tall`,
    same footprint). `TownPrefabCatalog.prefabNameFor` picks the taller one for
    about 40% of buildings from a per-building seed, so streets step up and down.
  - Large towns get a tiered fountain instead of a well. Lamp posts alternate
    with banner lamp posts. Ivy trails from the jetties.
  - Tudor upper timber stories jetty 0.3 m per story over the street, on joist
    ends, a bressumer and curved brackets. Their roofs widen forward to match
    (`Roof_Gable_S6J2` and so on).
  - Wide Tudor houses get a front cross-gable (`Cross_Gable_3` / `_4`).
  - Stone and render windows have glazed round-arched heads under voussoirs.
  - Chimneys are tall stacks with a corbelled band and clay pots.
  - Street furniture lives in `modules/street_props.py`: flared iron lanterns,
    striped scalloped stall awnings, fleur-de-lis banners (also on
    `Lamp_Post_Banner`), and flower boxes.
  - Timber and dressed stone are chamfered.
  - Stone corners have long-and-short quoins.
  - Nordic and Tudor houses stand on stone plinths with entry steps.
  - Roofs show rafter tails, Nordic roofs have log ridges and crossed finials, and
    stone doors have voussoir arches.
  - Vertex colours bake occlusion, grime at the foot of walls, and a tone per
    piece (see `medkit/bevel.py`).
- **Textures:** CC0 Poly Haven scans (`medkit/scans.py`) cover rubble,
  ashlar, slate, terracotta, thatch, render, planks, clapboard and cobbles.
  Each scan is used at its real-world size. The procedural patterns remain as
  the fallback when a scan's files are missing.
- **Sky:** the 'Storybook (town golden hour)' preset matches the previews.
- **Skins** (`TownSkins.js`): one per town, from its climate, rank and culture.
  - frost: dark ashlar and snow on every upward face (`TownSnowMaterial.js`).
  - imperial: capitals and citadel cities.
  - sun: Mediterranean culture or a hot biome.
  - marsh: wetland or rainforest.
  - plains: other Nordic towns.
  - heartland: everything else.
  - Banners take a colour per culture, and hamlets get thatch.
- **Dressing and paving** (`TownDressing.js`):
  - Barrels, planters, woodpiles, bushes and fenced back yards are placed round
    houses. Each one is checked against buildings, streets and props.
  - Village-or-larger streets and squares are paved with `Paving_Stone`.
- **Plots:** `SettlementBuildingCatalog` footprints now match the kit prefab
  sizes plus eaves and steps. Towns are therefore denser, and less ground is
  painted as street.
