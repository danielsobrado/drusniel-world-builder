# Reference-image → model → PBR texture → playable scene pipeline

## Source control and production steps

**Stage 0 — lock lore:** Select realm, culture/branch and role, then check source URLs. Annotate anything invented as `design proposal`. Choose 2–4 silhouette cues distinguishing that culture from the others.

**Stage 1 — scene mood boards:** Generate 2 wide *context* images per scenario to validate settlement grammar, biome, circulation, industry, civic hierarchy, material palette. These are NOT good single-object image-to-3D inputs. Reject if terrain or people are implausible.

**Stage 2 — isolated asset references:** Generate one hero reference **per object**, 3/4 front, neutral studio lighting, no ground clutter, no text, entire object visible. Save prompt and seed/model metadata. Approve shape, dimensions, access, roof construction and functional detail.

**Stage 3 — orthographic/support views:** Feed the approved hero back as a visual reference; request **front**, **left side**, **rear**, **top/roof** in four separate images. Hold geometry/materials fixed. Orthographic views must not invent extra doors, floors or roof slopes. For anything occluded, a human artist resolves it, not blind model blending.

**Stage 4 — texture references:** Produce flat, shadowless, 1:1 tileable photos of **realistic substrates** (stone, plaster, timber, iron, cloth, ceramic, thatch, etc.) with no perspective or cast shadows. Treat outputs as **albedo art references only**. Derive actual albedo/normal/roughness/metalness/AO via physically appropriate scanning/baking/material tools; verify seamless edges by tiled preview (3×3).

**Stage 5 — asset manufacture:** Create Blender mesh or image-to-3D draft, retopologize, correct backfaces, enforce scale, set pivots/origin, generate UVs, bake LOD/collision and textures. Avoid carrying baked lights into albedo.

**Stage 6 — verification & integration:** Validate polygon count and texture budgets against the project's active LOD/atlas pipeline. Export GLB; register in catalog and scene recipe; review in both default settlements and the optional `?towns=kit` mode if both renderers remain supported.

## World-space and camera convention

- Units meters, +Y up in runtime/Three.js; **verify actual current exporter** axis and pivot before automated import.
- Asset faces local +Z if following the town prefab convention, with human access and trade delivery along reachable streets.
- Suggested initial size examples: hand prop 0.1–1 m; stall 3–5 m; cottage 6–10 m; hall 12–22 m. Measure each against game unit scale before approval; these are production defaults, not lore facts.
- Camera named views: `hero` = orthographic 3/4 front, elevated ~20–30°; `front`, `left`, `rear`, `top`. Keep the **same design reference** in every view.
- Lighting for geometry reference is diffuse/neutral; colorful dusk, fog, magic effects are for the **scene mood board only**.

## Copy/paste prompt recipe

Each regional dossier includes stand-alone **Hero image prompts** for every target asset. Use the following follow-up after generating its hero, attaching that exact hero reference image:

**Front:** “Using the attached approved object image as strict design reference, render *the exact same object* facing the camera, front orthographic elevation, centered, no perspective, roof and doors unchanged, consistent dimensions, identical materials, white or neutral transparent-look background, neutral even daylight, full object in frame, no people, labels, ground decorations or new geometry.”

**Left side:** “Using the same approved object reference, render exact matching object, LEFT orthographic elevation, no perspective, preserve footprint, roof profile, window count, material and weathering, no new or missing geometry, full silhouette visible on plain background.”

**Rear:** “Using the same approved object reference, render exact matching object from REAR in strict orthographic elevation, maintain all structural decisions and materials, plausible service openings ONLY if approved, no reinterpretation, no signs or background.”

**Top:** “Using the same approved object reference, exact same object from roof/top orthographic view, show total footprint, ridges and roof intersections, do not add levels/structures.”

**Detail:** “Macro reference of the approved object showing joinery, roof edge, substrate transitions, erosion/wear at plausible touch points, diffuse neutral studio lighting and accurate material appearance; no new ornament.”

Do **not** assume that prompting guarantees multi-view geometry consistency; visually cross-check views and reject contradictions before reconstruction.

## Texture prompt pattern

> Seamlessly tileable square PBR **base-color reference photograph** of [material], 1×1 meter representative area, diffuse overcast even illumination, top-down orthographic plane, albedo appearance, authentic fine-scale grain and roughness, continuous at all four edges, no cast shadows, no highlights, no perspective, no objects, no symbols, no lettering, no directional baked light, no atmospheric effects, no border, physically believable for a medieval/fantasy built environment.

Generate variations for condition (`fresh`, `weathered`, `wet`, `frosted`, `soot-stained`) as material overlays, not wholly unrelated base materials. Match roughness/normal direction to the authored mesh UV scale.

## Required asset artifacts and review

```text
asset-id/
  brief.md                # canonical lore, scale, function, provenance, prompt, seed
  hero.png                 # approved 3/4 reference
  front.png left.png rear.png top.png detail.png
  source.blend              # editable actual geometry
  asset_lod0.glb asset_lod1.glb asset_lod2.glb
  collision.glb             # optional simple primitive/collider
  material-notes.md
```

Image references and mesh/textures do not need to be committed to Git as oversized binary files; use the existing asset pipeline and ignored locally generated medieval kit GLBs. Track provenance and relative URIs in manifests. No GitHub Actions are necessary.

## Quality gates

1. **Lore correctness:** site and repo mapping validated; speculative inventions labeled.
2. **Functional credibility:** roofs shed local rain/snow; smoke/ventilation, drainage, stairs, windows, trade and storage plausible.
3. **Readable silhouette:** identifiable at town camera distance; region differentiation beyond hue.
4. **Geometry:** consistent orthographic set, watertight logical building envelope where needed, correct scale/origin, bounded collision.
5. **Textures:** seamless test, PBR channels valid, no baked lighting in base color, atlas/LOD compatibility.
6. **Performance:** module instancing/texture reuse, no uncontrolled bespoke material count or 200 unique LOD0 buildings in one draw scene.
7. **Integration:** deterministic seed selection and authored fallback; errors logged when eligible prefab missing.
