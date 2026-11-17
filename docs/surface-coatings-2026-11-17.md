# Surface coatings: snow and moss

Snow and moss are drawn as **coats**: a second material with its own albedo,
normal and roughness, laid over the surface beneath by a coverage mask. They are
not tints. Three responsibilities stay apart:

| Responsibility | Decided by | Where |
| --- | --- | --- |
| Coverage — where a coat lies | Each surface's existing masks | `snowDeposition()`, the snowline, storm snow, `instanceBiomeLook`, moss masks |
| Appearance — what a coat looks like | The coat | `src/editor/stylized/surfaceCoatings/SnowCoat.js`, `MossCoat.js` |
| Composition — laying it over the base | One pure function | `src/render/materials/surfaceLayers/PbrCoatBlend.js` |

Do not add a second snow or moss coverage system. To change where a coat lies,
change that surface's mask. To change how it looks, change the coat or its
config.

## Composition (`PbrCoatBlend.js`)

- `blendCoat(base, coat, coverage)` mixes `color`, `roughness`, optional
  `metalness`, and `normal`. It is pure: no textures, no state, no mutation.
  A coat without a normal returns the base's own normal node, so callers can
  test `surface.normal !== baseNormal` and leave `normalNode` alone.
- Normals are **unit view-space** vectors, as `MeshStandardNodeMaterial.normalNode`
  takes them. The base normal is `material.normalNode ?? materialNormal`, which
  keeps the authored normal map without fetching it twice.
- `perturbByMap(n, sample, dx, dy, strength)` applies a tangent-space normal
  map on any projection through the cotangent frame of its screen derivatives,
  so it needs no tangent attribute and follows instance rotation and scale.
- `perturbByHeight(n, height, maxSlope)` tilts a normal by the screen gradient
  of a height field in metres, capped so per-quad derivatives do not draw
  blocks. `barkBumpNormal` uses it too.
- `coatDetailFade(detail)` fades micro-detail between `nearDistance` and
  `farDistance`, so fine normals do not shimmer at range.

Both perturb helpers take derivatives: call them in uniform control flow, never
inside an `If`.

## Snow coat (`SnowCoat.js`)

`snowCoat(p, n, cover)` gives `{ tint, roughness, normal() }` from the terrain's
own Snow007C set (`acquireSnowTextures`): grain, blue cavities and normals, so
snow on a rock or a roof matches the snowfield.

- `p` and `n` must share a frame that does not move with the floating origin:
  the building's or stone's own space (`positionGeometry`/`normalGeometry`), or
  town space on the kit.
- Every texture load sits behind `cover > 0.002`. A snowless surface pays one
  branch, not 24 texel loads. The loads use `RepeatMipTextureLoad`, as the
  terrain does, because the maps are bound sampler-free.
- `normal()` is built on `normalView`. In the normal stage that is the
  geometric normal, so snow buries the relief beneath it.

## Moss coat (`MossCoat.js`) and growth (`MossGrowthMask.js`)

`mossCoat({ color, pillow, tuft })` takes the caller's painted moss colour and
two 0..1 fields the surface already samples: cushions (`pillow`) and tufts
inside them (`tuft`). It shades the low ground between cushions and gives soft
roughness and height-derived normals built on the base normal, so a mat
follows the stone's relief.

`mossGrowth({ field, potential, sparse, dense, edge })` turns potential (biome
× material × orientation) into a threshold on a stable field. More potential
means larger patches, each fully moss, rather than one translucent film. Zero
potential grows nothing, so `rock.moss: 0` biomes stay bare. Take orientation
from `normalWorldGeometry`, not the shaded normal, or normal-map bumps speckle
the edge.

## Where the coats are applied

| Surface | File | Order |
| --- | --- | --- |
| Authored rocks | `stylized/rockWeathering.js` | stone → moss coat → dust/soil/water → snow coat |
| Alpine crags | `stylized/alpine/AlpineRockMaterial.js` | cold stone → snow coat |
| Workshop houses in settlements | `render/materials/townGrade.js`, then `world/settlements/view/SettlementSnow.js` | graded surface → moss coat → wet film → snow coat |
| Medieval town kit | `towns/TownKitMaterial.js` | atlas → weathering → moss coat → wet film → snow coat |
| Tree trunks | `stylized/barkWeathering.js` | bark → moss coat → soil/wet → trunk snow (colour only) |

`weatherTownLayers` in `render/materials/townWeathering.js` returns the
weathered colour **without** moss, plus the moss layer
(`{ mask, color, pillow, tuft }`). Lay the moss with the coat, never by
mixing the colour in as well, or the moss is counted twice. On the kit, moss
takes hold in joints first through the crevice signal the material already
derives from its normal map.

Snow comes after moss, so snow covers it without moving the moss beneath.
On towns, a thinner snowfall raises the hold threshold: fewer faces are
covered, each fully, instead of every face in a grey film.

## Configuration

`stylizedSurface.surfaceCoatings` in `editor.config.yaml` holds appearance
only. It is resolved and validated by `resolveSurfaceCoatings` when
`loadEditorConfig` runs, and registered for materials built afterwards
(`surfaceCoatings()`).

| Key | Meaning |
| --- | --- |
| `snow.enabled`, `moss.enabled` | `false` compiles that coat's surfaces as they were before coats |
| `snow.normalStrength` | Share of Snow007C's normal kept |
| `snow.roughness`, `moss.roughness` | Coat roughness, 0..1 |
| `moss.pillowHeight`, `moss.tuftHeight` | Relief in metres (≤ 0.1) |
| `moss.recessShade` | How much darker the ground between cushions is |
| `detail.nearDistance`, `detail.farDistance` | Micro-detail fade, metres |

Biome moss and snow amounts stay in `config/biome-looks.yaml`, and the snowline
and storms stay in their own config.

## Not covered yet

- Dedicated locations (`locations/materials/StoneSurface.js`,
  `LocationShading.js`) light a `MeshBasicNodeMaterial` themselves. A coat
  there must blend their world-space albedo, normal, roughness and `f0`
  before their lighting runs; do not assign the outdoor nodes directly.
  `IceCover.js` already has its own, richer snow-over-ice model.
- Settlement snow's edge noise still reads render-space `positionWorld`, so
  its edge can shift on a floating-origin rebase. The snow texture itself uses
  the building's own frame.
- The moss relief adds per-pixel noise taps on town and trunk surfaces. It has
  not been measured with `qa:perf`; A/B it before tuning it upward.

## Tests

`tests/surfaceCoatings.test.js` checks that zero coverage leaves the base
untouched, that zero potential grows no moss, that disabled coats change
nothing, that the config refuses bad values, and that rock and town shaders
generate for both WebGPU and WebGL.
