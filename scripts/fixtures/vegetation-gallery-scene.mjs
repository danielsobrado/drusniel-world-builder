import * as THREE from 'three/webgpu';
import { tightlyPackRgbaReadback } from '../../src/editor/stylized/impostor/TreeImpostorAtlasPixels.js';
import { worldWindUniforms } from '../../src/editor/weather/wind/worldWindState.js';
import { galleryFrame, galleryCoverage } from './vegetation-gallery-layout.mjs';

const TILE_SIZE = 512;

function boundsOf(meshes) {
  const bounds = new THREE.Box3();
  for (const mesh of meshes) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox);
  }
  if (bounds.isEmpty()) throw new Error('Gallery prototype has empty geometry bounds.');
  return bounds;
}

function configureInstance(mesh, matrix, seed) {
  mesh.count = 1;
  mesh.setMatrixAt(0, matrix);
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, 16);
  mesh.instanceMatrix.needsUpdate = true;
  for (const [name, values] of [
    ['instanceDither', [1, seed, 1]],
    ['instanceMorphology', mesh.geometry.getAttribute('instanceRootPlane') ? [0, 1, 1] : [1, 1, 1]],
    ['instanceRootPlane', [0, 0, 0]],
    ['instanceLeafTint', [1, 1, 1, 0]],
    ['instanceBiomeLook', [1, 1, 1, 1]],
    ['instanceSurface', [0, 0, 0]],
    ['instancePlantRoot', [0, 0, 0]],
  ]) {
    const attribute = mesh.geometry.getAttribute(name);
    if (!attribute) continue;
    attribute.array.set(values, 0);
    attribute.clearUpdateRanges();
    attribute.addUpdateRange(0, attribute.itemSize);
    attribute.needsUpdate = true;
  }
  mesh.visible = true;
  mesh.frustumCulled = false;
}

/** Terminal QA fixture: the world animation loop is stopped by the caller. */
export async function captureVegetationGallery(editor, { layer, representation, first, last }) {
  const renderer = editor.terrainView.renderer;
  const view = layer === 'trees' ? editor.stylizedSurface.treeView : editor.stylizedSurface.bushView;
  const near = layer === 'trees' ? view.renderers : view.meshes;
  const proxy = layer === 'trees' ? view.proxyRenderers : view.proxyMeshes;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x80796e, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2);
  light.position.set(4, 8, 6);
  scene.add(light);
  const target = new THREE.RenderTarget(TILE_SIZE, TILE_SIZE, {
    format: THREE.RGBAFormat, type: THREE.UnsignedByteType, depthBuffer: true,
  });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const output = document.createElement('canvas');
  output.width = TILE_SIZE * (last - first);
  output.height = TILE_SIZE;
  const ctx = output.getContext('2d');
  const previousTarget = renderer.getRenderTarget();
  const previousColor = renderer.getClearColor(new THREE.Color()).clone();
  const previousAlpha = renderer.getClearAlpha();
  const previousAutoClear = renderer.autoClear;
  const { windowCenter, windowCenterCanonical, windowSize, prevailingStrength } = worldWindUniforms;
  const previousWindCenter = windowCenter.value.clone();
  const previousCanonicalCenter = windowCenterCanonical.value.clone();
  const previousWindStrength = prevailingStrength.value;
  const slots = [];
  try {
    // Sample zero prevailing wind outside the streamed gust field.
    windowCenter.value.set(windowSize.value * 2, 0);
    windowCenterCanonical.value.copy(windowCenter.value);
    prevailingStrength.value = 0;
    renderer.autoClear = true;
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(target);
    for (let prototypeIndex = first; prototypeIndex < last; prototypeIndex++) {
      const nearParts = near[prototypeIndex] ?? [];
      const proxyParts = proxy[prototypeIndex] ?? [];
      const parts = representation === 'near' ? nearParts : proxyParts;
      if (!nearParts.length || !proxyParts.length) throw new Error('Missing gallery representation: ' + prototypeIndex);
      const bounds = boundsOf([...nearParts, ...proxyParts]);
      const frame = galleryFrame(bounds.min.toArray(), bounds.max.toArray());
      const camera = new THREE.OrthographicCamera(-frame.halfSize, frame.halfSize,
        frame.halfSize, -frame.halfSize, 0.01, frame.distance * 3);
      camera.position.set(frame.center[0], frame.center[1], frame.center[2] + frame.distance);
      camera.lookAt(...frame.center);
      camera.updateMatrixWorld(true);
      const matrix = new THREE.Matrix4();
      const parents = parts.map(mesh => mesh.parent);
      try {
        for (const mesh of parts) {
          configureInstance(mesh, matrix, 0.37 + prototypeIndex * 0.013);
          scene.add(mesh);
        }
        renderer.clear();
        await renderer.render(scene, camera);
        const pixels = tightlyPackRgbaReadback(await renderer.readRenderTargetPixelsAsync(
          target, 0, 0, TILE_SIZE, TILE_SIZE), TILE_SIZE, TILE_SIZE);
        slots.push({ prototypeIndex, ...galleryCoverage(pixels, TILE_SIZE, TILE_SIZE) });
        const data = new Uint8ClampedArray(pixels);
        ctx.putImageData(new ImageData(data, TILE_SIZE, TILE_SIZE), (prototypeIndex - first) * TILE_SIZE, 0);
      } finally {
        for (let i = 0; i < parts.length; i++) {
          scene.remove(parts[i]);
          parents[i]?.add(parts[i]);
        }
      }
    }
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = '#303832';
    ctx.fillRect(0, 0, output.width, output.height);
    return { png: output.toDataURL('image/png').split(',')[1], slots };
  } finally {
    windowCenter.value.copy(previousWindCenter);
    windowCenterCanonical.value.copy(previousCanonicalCenter);
    prevailingStrength.value = previousWindStrength;
    renderer.setRenderTarget(previousTarget);
    renderer.setClearColor(previousColor, previousAlpha);
    renderer.autoClear = previousAutoClear;
    target.dispose();
  }
}
