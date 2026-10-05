# Gods’ End objects and textures

The local source is `/home/drusniel/drusniel-gods-end`. Its complete published
visual asset collection is copied into `public/assets/gods-end/Assets`, retaining
relative paths so shared external glTF textures still resolve. The import contains
107 GLBs and 255 texture/image assets. Original metadata and attribution manifests
are retained beside their assets. Local Draco and Basis decoders come from the
installed Three.js package.

The object palette includes 144 Gods’ End entries: original and fantasy trees,
rock variants, wooden lanterns, understory plants, jungle plants and modules,
grass prototypes, props, five posed birds, five procedural medieval houses,
eight aquatic plants and three procedural seabed boulders.
Search for **Gods’ End** in Objects. Technical landscape, collision, reference
scene and vegetation LOD inputs remain available in the archive; they are not
placed as huge demo scenes. Existing character and wildlife runtimes continue
to use their own prepared assets.

The five house recipes preserve the donor’s silhouettes, UVs, vertex colours,
surface batches, roof sweeps, dormers, stairs, foundations and palettes. Their
authored recipes and metre dimensions remain independent of generated buffers.
These are reusable catalog objects; editable workshop construction continues
through the semantic workshop framework. No building components are reconstructed
from imported triangles.

Only selected or saved objects load. The rest of the catalog allocates no model
geometry or textures. An unplaced selection is released when the selection/tool
changes; placed definitions share materials through a reference-counted scene
cache. Native saves persist ordinary stable object keys and placements, and restore
the relevant models on demand. All imports work without the donor checkout.

In the workshop, **Gods’ End texture library** selects local PNG/JPEG/WebP maps
for imported albedo areas. The material inspector also offers library selectors
for albedo, normal, ORM and height channels. Selected images go through the existing
bounded upload path and are embedded in the saved material document. KTX2
vegetation atlases and the HDR environment remain native runtime assets rather
than workshop upload images.

The shared procedural generators are exposed by
`src/editor/assets/godsEnd/textures.js`: nine house surfaces, leaf palettes,
grass atlas, barrier noise, sea/river detail, waterfall strands, spray puffs,
serpent skin, and snow surface maps. Catalog buildings and workshop material
presets reuse the house surfaces. Existing sea, snow, leaf and wildlife systems
use their respective ported generators.

Aquatic geometry preserves the donor's sea grass, kelp, red algae, eelgrass,
waterweed, pondweed, lily pads and flowering lily pads, including both source
LODs. The automatic aquatic layer animates their tips with the donor's water
clock while keeping roots fixed. Palette plants and boulders use water-body,
coverage and depth rules: rooted objects anchor to the bed; lily pads ride
the lake surface. Their ordinary saved placement keys survive origin rebasing.
The three boulder recipes preserve the original rounded, flattened shapes,
rock mottling and upward-facing weed. Their texture coordinates stay local
to the placed object.

Terrain uses the donor's endpoint-preserving height blend to break grass/soil,
rock/snow and wet-bank boundaries. It consumes the existing material and
shoreline masks, with wrapped noise origins shared across chunk boundaries.
Authored paths retain priority. The `families.transitions` settings in
`config/terrain-material-bake.yaml` control strength, edge width and distance
fade; the effect adds no samplers or CPU terrain-page generation work. Azgaar
biome IDs and saved terrain definitions remain canonical.

The `underwater.optics` settings in `config/water-domain.yaml` port the donor's
spectral absorption, depth dimming, caustic lattice, shafts, surface ripples,
Snell window, underside reflection and screen distortion. High/ultra quality
reuse the existing prewarmed underwater scene pass and bypass it above water;
lower tiers retain their existing fog fallback. Ocean and inland scattering
colours differ, and all ripple/caustic phases remain stable across rebasing.

GPU validation also required two Three.js r186 compatibility repairs: snow
maps use manually filtered texture loads to stay within the 16-sampler limit,
and tone mapping accepts computed colour nodes and preserves RGBA output.

Reimport and validation:

Final validation passed `npm run verify` (6,211 tests, production asset checks
and build), donor byte/checksum comparison, and portable import validation.
The final disabled-postprocess fallback guard also passed 16 focused underwater
tests and a fresh production build. The shared browser QA lock retries a lock
removed during ownership checks, with six lock tests covering contention,
initialization, release and timeouts.

```bash
npm run import:gods-end-assets
# Another source checkout:
npm run import:gods-end-assets -- --source=/path/to/drusniel-gods-end
# Compare against the donor without writing:
npm run import:gods-end-assets -- --check
# Portable validation; does not require the donor checkout:
npm run validate:gods-end-assets
node --test test/gods-end-objects.test.js test/gods-end-textures.test.js test/gods-end-aquatic.test.js
npm run verify
```

`public/assets/gods-end/manifest.json` records each source path, published path,
byte length and SHA-256. Validation checks every imported file, external GLB
dependency, selected root, texture path and collision footprint. Reimport refuses
to overwrite a locally changed imported file.

Browser acceptance uses the existing dev server:

```bash
npm run qa:gods-end-assets -- --headed --url http://localhost:5173
```

On WSL, run `scripts/run-gods-end-asset-qa.mjs` with native Windows Node, as with
the performance harness in `docs/perf-qa.md`. The runner loads every catalog
entry, checks real vertex bounds, renders representative objects on hardware
WebGPU, and exercises workshop albedo/normal image import. Reports and screenshots
are written to `tmp/gods-end-assets-qa`. Movement comparisons use the deterministic
`chunk-cross` harness with 8 s warmup, settled scenery and 12 s measured movement.

Hardware validation on 2026-10-05 (native Windows Chromium, NVIDIA Lovelace,
1280×720, WebGPU) recorded:

Asset acceptance loaded all 144 entries with valid vertex bounds and footprints,
rendered ten published object fixtures, retained their saved keys and imported
albedo/normal selections from the library of 189 images through the bounded upload path. No browser
or shader errors occurred. `tmp/gods-end-assets-qa/objects.png` shows the
published scene; the harness waits for streamed draw preparation before capture.

| Check | Baseline | Port |
| --- | --- | --- |
| Settled `chunk-cross` frame p95 | 7.7 ms | 7.9 ms |
| Hitches over 33.3 ms | 1 / 2,070 frames | 2 / 2,030 frames |
| Terrain commit p95 | 0.1 ms | 0.1 ms |
| Browser errors | 0 | 0 |

Both frozen runtimes include the sampler and tone-mapping compatibility repairs;
this comparison isolates the port's additional catalog and surface work. These
single captures pass the broad p95/hitch-rate gates but do not establish a speed
improvement, and neither meets the guide's stricter zero-hitch target. Reports
are `tmp/gods-end-objects-baseline.json` and `tmp/gods-end-objects-final.json`.

The high-quality dry → swim → dive → surface → dry route passed every water
acceptance gate, with 7.8 ms frame p95, zero browser/GPU validation errors, and
a maximum 0.3 ms post-effect CPU cost (4.4 ms including its scene pass). Its
report is `tmp/gods-end-water-acceptance.json`; use
`npm run qa:water:acceptance -- --out tmp/my-water.json` to keep a separate capture.
Large-coordinate phase continuity is covered by
the deterministic rebase tests; this route itself did not trigger an origin snap.
