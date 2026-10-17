import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { StylizedSceneAssetCache } from '/src/editor/stylized/StylizedSceneAssetCache.js';
import { extractAuthoredMeshPrototypes } from '/src/editor/stylized/StylizedPrototypeBake.js';
import { createStylizedRockMaterial } from '/src/editor/stylized/StylizedRockView.js';
import { resolveRockWeathering } from '/src/editor/stylized/rockWeathering.js';
import { createInstancedRenderers, writeInstances, disposeInstancedRenderers } from '/src/editor/stylized/lod/StylizedLodRuntime.js';

/** Actual authored pack and production weathering, independent of terrain finish. */
export async function runRockSwatches({ raw, renderer, scene, camera, draw, state }) {
  const cache = new StylizedSceneAssetCache({ renderer }), prototypes = [];
  try {
    for (const definition of raw.assets.rockVariants) {
      prototypes.push(...extractAuthoredMeshPrototypes(await cache.acquire(definition.scene), { scale: definition.scale }));
    }
    const settings = resolveRockWeathering(raw.rocks.weathering);
    camera.fov = 48; camera.position.set(0, 13, 20); camera.lookAt(0, 0, -2); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    for (const mode of ['dry', 'wet', 'albedo']) {
      const root = new THREE.Group(); scene.add(root);
      const parts = prototypes.map(({ geometry, source }) => {
        const material = createStylizedRockMaterial(source, raw, { settings, seaLevel: 0 });
        if (mode === 'albedo') { material.emissiveNode = material.colorNode; material.colorNode = vec3(0); }
        return [{ geometry, material, kind: 'rock', instanceSurface: true }];
      });
      const batches = createInstancedRenderers({ root, partsByPrototype: parts, capacity: 1, name: 'rock-swatch', renderer });
      const records = prototypes.map(({ geometry }, i) => {
        geometry.computeBoundingBox();
        const size = geometry.boundingBox.getSize(new THREE.Vector3()), scale = 2 / Math.max(size.x, size.y, size.z);
        const matrix = new THREE.Matrix4().makeScale(scale, scale, scale);
        matrix.setPosition((i % 6 - 2.5) * 3, -geometry.boundingBox.min.y * scale, -Math.floor(i / 6) * 4);
        return [{ matrix, fade: 1, seed: .5, colorVariation: 1, surfaceData: mode === 'wet' ? [.8, 1, 0] : [0, 0, 0] }];
      });
      writeInstances(batches, records);
      try {
        const pixels = await draw(`rocks-${mode}`, { mode, prototypes: prototypes.length, settings });
        const values = []; let finite = true;
        for (let i = 0; i < pixels.length; i += 4) {
          const value = pixels[i] * .2126 + pixels[i + 1] * .7152 + pixels[i + 2] * .0722;
          finite &&= Number.isFinite(value) && value >= 0;
          if (value > 1e-7) values.push(value);
        }
        values.sort((a, b) => a - b);
        const p10 = values[Math.floor(values.length * .1)], p90 = values[Math.floor(values.length * .9)];
        state.report.checks.push({ id: `rocks-${mode}-finite-planes`, visible: values.length, p10, p90,
          passed: finite && values.length > 1000 && p90 > p10 * 1.1 });
      } finally {
        disposeInstancedRenderers(root, batches); scene.remove(root); parts.flat().forEach(part => part.material.dispose());
      }
    }
  } finally { prototypes.forEach(p => p.geometry.dispose()); cache.dispose(); }
}
