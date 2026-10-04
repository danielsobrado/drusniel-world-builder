# Gods’ End objects and textures

The local source is `/home/drusniel/drusniel-gods-end`. Its complete published
visual asset collection is copied into `public/assets/gods-end/Assets`, retaining
relative paths so shared external glTF textures still resolve. The import contains
107 GLBs and 255 texture/image assets. Original metadata and attribution manifests
are retained beside their assets. Local Draco and Basis decoders come from the
installed Three.js package.

The object palette includes 133 Gods’ End entries: original and fantasy trees,
rock variants, wooden lanterns, understory plants, jungle plants and modules,
grass prototypes, props, five posed birds, and five procedural medieval houses.
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

Reimport and validation:

```bash
npm run import:gods-end-assets
# Another source checkout:
npm run import:gods-end-assets -- --source=/path/to/drusniel-gods-end
# Compare against the donor without writing:
npm run import:gods-end-assets -- --check
# Portable validation; does not require the donor checkout:
npm run validate:gods-end-assets
node --test test/gods-end-objects.test.js test/gods-end-textures.test.js
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
