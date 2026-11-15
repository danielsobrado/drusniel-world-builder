# Workshop city kits

The shape workshop's starting designs include one catalog per Drusniel realm, so a whole city
can be assembled in each culture's own architecture. Realms and their building needs come
from drusniel.com, digested in `docs/asset-bible/regions/*.md`.

## Where things live

| Piece | File |
|---|---|
| Realm catalogs (data) | `src/editor/workshop/shapes/config/cities/NN-<realm>.yml` |
| Generated catalog module | `config/ShapeCityPresets.generated.js` (`npm run generate:workshop-castle`) |
| Loader and validation | `tools/workshop-city-presets.mjs` |
| Style grammar and part builders | `shapes/cities/ShapeCityParts.js` |
| Blueprints | `shapes/cities/ShapeCityHomes.js` (houses, rows, farms), `ShapeCityTrade.js` (inns, shops), `ShapeCityDefences.js` (towers, walls, stairs), `ShapeCityPlazas.js` (squares) |
| Facade detail pass | `shapes/cities/ShapeCityDetails.js` |
| Plot pass (paths, yards, wells, woodsheds) | `shapes/cities/ShapeCitySurroundings.js` |
| Hand-cut stone shaping (all shape masonry) | `shapes/ShapeStoneCut.js` |
| Blueprint registry and build | `shapes/cities/ShapeCityKit.js` |
| Realm materials | `shapes/cities/ShapeCityPalette.js` |
| Side/offset placement | `shapes/cities/ShapeSidePlacement.js` |

## A realm catalog

- `group`: the picker's optgroup label.
- `palette`: the realm look. `recipe` sets the recipe bases (`style`, `finish`, `topStyle`,
  `weathering`, `irregularity` — rough orc fieldstone 0.9, precise Contian ashlar 0.15). The slots `plaster`, `masonry`, `planks` (one per shell surface), `roof`, `trim`,
  `timber`, `metal` and `glass` become material presets. A slot's `color` is the albedo itself;
  shape vertex colours only add near-neutral occlusion. Keep colours near the workshop
  defaults' brightness (plaster `#e2d5b9`, slate `#405563`). An optional `surface` multiplies in
  a generated God's End texture, which is dark, so use it only with pale colours. Flat roofs
  take the `trim` stone.
- `style`: the grammar every blueprint reads. Covers surfaces, roof family, pitch, sweep and
  sag, footprint family and corner radius, `scale` and `storey`, `stilts`, door and window
  profiles, ivy, weathering, plinth, `tower`, `wall` and `path` materials, and `gable: depth`
  for gable-fronted cultures. Defaults are in `CITY_STYLE_DEFAULTS`.
  - `details`: the facade recipe run on every decorated volume — `windows` (fills each storey of
    each side to a density its length allows), `porch`, `hood`, `dormers` (eave sides only),
    `balcony` (with its door), `bay`, `oriel`, `buttresses` (masonry), `turret`. Each only goes
    where its wall is free; sheds, towers, terraces and ovens opt out with `decorate: false`.
  - `surroundings` and `yard`: the plot around houses, farms, inns and shops — `path` from the
    front door, `yard` (front wall with a gate on the path, plus side returns, in `yard.surface`),
    `well`, `woodshed`. Each is added only where it clears every existing shape.
- `kit`: `{ id, label, blueprint, style?, palette?, with? }`. Drawn at runtime from the blueprint
  in the realm style. `style` and `palette` tweak that one entry; `with` patches its main shape.
- `presets`: hand-authored landmarks as plain shape data, with an optional `palette` override.

`test/workshop-shape-city-presets.test.js` requires every catalog to
offer at least five house types, three farms, three inns, five shops, three towers, two walls,
two stair kinds, two plazas and two landmarks. It also checks that every shell gets a realm material.

## Authoring tips

- Openings and features take `side` (front/back/left/right) and `along` (metres to the viewer's
  right; a list makes a row) instead of perimeter `at`. Blueprints use `f` (-1..1 of the usable
  side) so they survive a realm's `scale`.
- Prefix labels with their category (`House ·`, `Farm ·`, `Inn ·`, `Shop ·`, `Tower ·`,
  `Wall ·`, `Stairs ·`, `Landmark ·`) so the picker scans well.
- Review a realm with `node scripts/review-workshop-shapes.mjs --coarse --only=<ids>`. It picks
  presets through the real UI, so the realm palette applies.

## Stonework

Every shape masonry course stone is cut by `shapeStoneCut`, which draws on `stoneJitter` and
`stoneQuadCorners` so the recipe `irregularity` and the stone category (crisp ashlar and
merlons, rough field stone) govern it. Corners only move inwards (uneven joints, never out of
the course band), each stone stands slightly proud or sunk, and its face is four facets
meeting at an off-centre crown. The course ceiling under a roof is measured at the furthest
reach a stone can have (`CELL_RELIEF`), so crowned stones never pierce an eave.
