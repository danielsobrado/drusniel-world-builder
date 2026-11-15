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
| Blueprints | `shapes/cities/ShapeCityHomes.js` (houses, farms), `ShapeCityTrade.js` (inns, shops), `ShapeCityDefences.js` (towers, walls, stairs) |
| Blueprint registry and build | `shapes/cities/ShapeCityKit.js` |
| Realm materials | `shapes/cities/ShapeCityPalette.js` |
| Side/offset placement | `shapes/cities/ShapeSidePlacement.js` |

## A realm catalog

- `group`: the picker's optgroup label.
- `palette`: the realm look. `recipe` sets the recipe bases (`style`, `finish`, `topStyle`,
  `weathering`). The slots `plaster`, `masonry`, `planks` (one per shell surface), `roof`, `trim`,
  `timber`, `metal` and `glass` become material presets. A slot's `color` is the albedo itself;
  shape vertex colours only add near-neutral occlusion. Keep colours near the workshop
  defaults' brightness (plaster `#e2d5b9`, slate `#405563`). An optional `surface` multiplies in
  a generated God's End texture, which is dark, so use it only with pale colours. Flat roofs
  take the `trim` stone.
- `style`: the grammar every blueprint reads. Covers surfaces, roof family, pitch, sweep and
  sag, footprint family and corner radius, `scale` and `storey`, `stilts`, door and window
  profiles, ivy, weathering, plinth, `tower`, `wall` and `path` materials, and `gable: depth`
  for gable-fronted cultures. Defaults are in `CITY_STYLE_DEFAULTS`.
- `kit`: `{ id, label, blueprint, style?, palette?, with? }`. Drawn at runtime from the blueprint
  in the realm style. `style` and `palette` tweak that one entry; `with` patches its main shape.
- `presets`: hand-authored landmarks as plain shape data, with an optional `palette` override.

`test/workshop-shape-city-presets.test.js` requires every catalog to
offer at least five house types, three farms, three inns, five shops, three towers, two walls,
two stair kinds and two landmarks. It also checks that every shell gets a realm material.

## Authoring tips

- Openings and features take `side` (front/back/left/right) and `along` (metres to the viewer's
  right; a list makes a row) instead of perimeter `at`. Blueprints use `f` (-1..1 of the usable
  side) so they survive a realm's `scale`.
- Prefix labels with their category (`House ·`, `Farm ·`, `Inn ·`, `Shop ·`, `Tower ·`,
  `Wall ·`, `Stairs ·`, `Landmark ·`) so the picker scans well.
- Review a realm with `node scripts/review-workshop-shapes.mjs --coarse --only=<ids>`. It picks
  presets through the real UI, so the realm palette applies.
