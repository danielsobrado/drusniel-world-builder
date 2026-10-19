# Template: isolated single asset hero and orthographic pack

**File target:** `references/<asset-id>/{hero,front,left,rear,top,detail}.png`.

## Hero 3/4

> Original Drusniel game-ready 3D environment asset reference: [SINGULAR ASSET NAME]. Region [REALM], architecture [CULTURE/BRANCH], functional role [ROLE], detailed shape [FOOTPRINT, HEIGHT, MATERIALS, ROOF, ENTRANCE, STRUCTURE], suitable for [TERRAIN/CLIMATE]. Single isolated full object at 3/4 front with slightly elevated orthographic camera, enough view to understand side and roof, sharp readable silhouette, consistent realistic hand-built medieval fantasy materials, neutral gray/off-white backdrop, uniform soft studio daylight. Entire object including feet/foundations visible, centered, no people, scenic background, foliage hiding geometry, floating props, text, logo or watermark, no extreme perspective, no extra artifacts. The image will be used for later GLB modeling, so joints, roof details and wall thickness must be physically coherent.

## Follow-up views

Use the *same approved hero as image input*. Generate separate front, left, rear, top orthographic outputs using the scripts in `02-image-to-3d-pipeline.md`. Record changed or disputed features in the asset `brief.md` before Blender reconstruction.

## Do not

- Ask for all four views in one image as the only reference to a 3D model.
- Let image AI decide new building functionality when rotating the object.
- Treat concept shading as PBR albedo.
