import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { waitForPerfRunLock } from './perf-run-lock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument('url', 'http://localhost:5173');
const output = path.join(root, 'tmp/gods-end-assets-qa');
await mkdir(output, { recursive: true });
const releaseBrowserLock = await waitForPerfRunLock(path.join(root, 'tmp', `perf-browser-${process.platform}.lock`), { timeoutMs: 900000 });
process.once('exit', releaseBrowserLock);
let browser = null;
const errors = [];
const failures = [];
const loaded = [];
try {
  browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: [
    '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  ] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/assets/gods-end/')) {
      errors.push(`HTTP ${response.status()}: ${response.url()}`);
    }
  });
  await page.goto(`${url}/?qa=move&autostart=0&download=0`);
  await page.waitForFunction(() => Boolean(window.__perfQa), null, { timeout: 240000 });
  const adapter = await page.evaluate(async () => {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
    return { fallback: Boolean(adapter?.isFallbackAdapter), description: adapter?.info?.description,
      vendor: adapter?.info?.vendor, architecture: adapter?.info?.architecture,
      webgpu: window.__editor.terrainView.renderer.backend.isWebGPUBackend === true };
  });
  assert.equal(adapter.webgpu, true);
  assert.equal(adapter.fallback, false, 'Hardware WebGPU is required.');
  assert.ok(adapter.vendor || adapter.architecture || adapter.description, 'The hardware adapter must be identified.');
  assert.ok(!/swiftshader|lavapipe|llvmpipe|warp|microsoft basic/i.test(JSON.stringify(adapter)));
  const keys = await page.evaluate(() => [...window.__editor.godsEndAssets.definitions.keys()]);
  for (const key of keys) {
    const result = await page.evaluate(async (key) => {
      const { controller, objectView, godsEndAssets } = window.__editor;
      controller.selectObjectDefinition(key);
      await godsEndAssets.ensure(key);
      const record = objectView.renderers.get(key);
      if (!record.parts.length) throw new Error(`No loaded parts: ${key}.`);
      let triangles = 0;
      let maxX = 0, maxZ = 0;
      for (const part of record.parts) {
        const position = part.geometry.getAttribute('position');
        triangles += (part.geometry.index?.count ?? position.count) / 3;
        const m = part.matrix.elements;
        for (let i = 0; i < position.count; i++) {
          const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
          if (![x, y, z].every(Number.isFinite)) throw new Error(`Non-finite geometry: ${key}.`);
          maxX = Math.max(maxX, Math.abs(m[0]*x+m[4]*y+m[8]*z+m[12]));
          maxZ = Math.max(maxZ, Math.abs(m[2]*x+m[6]*y+m[10]*z+m[14]));
        }
      }
      const footprint = record.definition.footprint;
      const tileSize = controller.tileMap.tileSize;
      if (maxX > footprint.width * tileSize / 2 + 0.01 || maxZ > footprint.depth * tileSize / 2 + 0.01) {
        throw new Error(`Loaded model exceeds its authored footprint: ${key} (${maxX}, ${maxZ}).`);
      }
      return { key, parts: record.parts.length, triangles };
    }, key).catch((error) => ({ key, error: error.message }));
    if (result.error) failures.push(result);
    else loaded.push(result);
  }

  const rendered = await page.evaluate(async () => {
    const { controller, objectView, objectMap, godsEndAssets, terrainView, viewModeController } = window.__editor;
    viewModeController.setMode('edit');
    const keys = ['gods-end-house-003', 'gods-end-house-004', 'gods-end-house-005', 'gods-end-house-006',
      'gods-end-house-009', 'gods-end-fantasy-tree1', 'gods-end-fantasy-tree10',
      'gods-end-fantasy-rocks-sm-rocks-01', 'gods-end-fantasy-lantern-lantern',
      'gods-end-coastal-jungle-objects-tropical-kit-palm-young'];
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      objectMap.restore({ id: 1000+i, definitionKey: key, x: (i%5)*12-24, z: Math.floor(i/5)*14-10, rotation: 0 });
    }
    godsEndAssets.restorePlaced();
    await Promise.all(keys.map((key) => godsEndAssets.ensure(key)));
    objectView.refreshAll();
    const THREE = await import('/node_modules/three/build/three.module.js');
    const bounds = new THREE.Box3();
    for (const key of keys) for (const mesh of objectView.renderers.get(key).meshes) {
      if (!mesh.count) throw new Error(`No rendered instance: ${key}.`);
      mesh.computeBoundingBox();
      mesh.updateMatrixWorld();
      bounds.union(mesh.boundingBox.clone().applyMatrix4(mesh.matrixWorld));
    }
    const center = bounds.getCenter(new THREE.Vector3());
    const span = bounds.getSize(new THREE.Vector3()).length();
    const camera = new THREE.PerspectiveCamera(55, 1280 / 720, 0.1, 5000);
    camera.position.copy(center).add(new THREE.Vector3(0.65, 0.8, 1).multiplyScalar(span));
    camera.lookAt(center);
    camera.updateMatrixWorld();
    viewModeController.cameraOverride = camera;
    await terrainView.renderer.compileAsync(terrainView.scene, camera);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    terrainView.renderer.render(terrainView.scene, camera);
    const document = controller.toDocument();
    if (!keys.every((key) => document.objects.some((object) => object.definitionKey === key))) {
      throw new Error('Imported object keys were not serialized.');
    }
    return { keys, saved: document.objects.length, installed: godsEndAssets.installed.size,
      bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() } };
  });
  // Streamed draw preparation hides new meshes until their real render passes
  // are ready. compileAsync alone does not publish them.
  await page.waitForFunction(() => {
    const { objectView, terrainView } = window.__editor;
    const preparation = terrainView.drawPreparation;
    return (!preparation || (preparation.pending.size === 0 && preparation.hidden.size === 0))
      && [...objectView.renderers.values()].every(record => record.meshes.every(mesh => !mesh.count || mesh.visible));
  }, null, { timeout: 180000 });
  await page.screenshot({ path: path.join(output, 'objects.png') });

  const texture = await page.evaluate(async () => {
    const { loadGodsEndTextureFile, GODS_END_IMAGE_TEXTURES } = await import('/src/editor/assets/godsEnd/textureLibrary.js');
    const { prepareWorkshopTexture } = await import('/src/editor/workshop/ProceduralWorkshopTextureUpload.js');
    const color = GODS_END_IMAGE_TEXTURES.find((entry) => /snow007c_color/.test(entry.path));
    const normal = GODS_END_IMAGE_TEXTURES.find((entry) => /snow007c_normal_gl/.test(entry.path));
    const files = await Promise.all([loadGodsEndTextureFile(color.path), loadGodsEndTextureFile(normal.path)]);
    const prepared = await Promise.all(files.map((file, i) => prepareWorkshopTexture(file, i ? 'normal' : 'albedo')));
    if (prepared.some((source) => source.width < 256 || source.width > 512
        || source.height !== source.width || !source.dataUrl.startsWith('data:image/'))) {
      throw new Error('Library textures did not use the workshop upload path.');
    }
    return { images: GODS_END_IMAGE_TEXTURES.length, imported: prepared.map(({ name, width }) => ({ name, width })) };
  });
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify({ adapter, loaded, failures, rendered, texture, errors }, null, 2)}\n`);
  assert.equal(failures.length, 0, JSON.stringify(failures));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(`Hardware WebGPU: loaded ${loaded.length} catalog entries, rendered ${rendered.keys.length} fixtures, imported albedo/normal textures with no shader errors.`);
} finally {
  await browser?.close();
  releaseBrowserLock();
}
