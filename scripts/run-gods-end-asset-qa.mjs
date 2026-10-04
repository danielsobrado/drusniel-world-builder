import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index < 0 ? fallback : process.argv[index + 1];
};
const url = argument('url', 'http://localhost:5173');
const output = path.join(root, 'tmp/gods-end-assets-qa');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: !process.argv.includes('--headed'), args: [
  '--enable-unsafe-webgpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
] });
const errors = [];
const failures = [];
const loaded = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /shader|wgsl|webgpu|gpu validation|pipeline|bind.?group|Gods.*End|couldn't load texture/i.test(message.text())) {
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
    const { controller, objectView, objectMap, godsEndAssets, terrainView } = window.__editor;
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
    controller.editorCamera.focusWorld(0, 0);
    await terrainView.renderer.compileAsync(terrainView.scene, controller.editorCamera.camera);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const document = controller.toDocument();
    if (!keys.every((key) => document.objects.some((object) => object.definitionKey === key))) {
      throw new Error('Imported object keys were not serialized.');
    }
    return { keys, saved: document.objects.length, installed: godsEndAssets.installed.size };
  });
  await page.screenshot({ path: path.join(output, 'objects.png') });

  const texture = await page.evaluate(async () => {
    const { loadGodsEndTextureFile, GODS_END_IMAGE_TEXTURES } = await import('/src/editor/assets/godsEnd/textureLibrary.js');
    const { prepareWorkshopTexture } = await import('/src/editor/workshop/ProceduralWorkshopTextureUpload.js');
    const color = GODS_END_IMAGE_TEXTURES.find((entry) => /snow007c_color/.test(entry.path));
    const normal = GODS_END_IMAGE_TEXTURES.find((entry) => /snow007c_normal_gl/.test(entry.path));
    const files = await Promise.all([loadGodsEndTextureFile(color.path), loadGodsEndTextureFile(normal.path)]);
    const prepared = await Promise.all(files.map((file, i) => prepareWorkshopTexture(file, i ? 'normal' : 'albedo')));
    if (prepared.some((source) => source.width !== 512 || !source.dataUrl.startsWith('data:image/'))) {
      throw new Error('Library textures did not use the workshop upload path.');
    }
    return { images: GODS_END_IMAGE_TEXTURES.length, imported: prepared.map(({ name, width }) => ({ name, width })) };
  });
  await writeFile(path.join(output, 'report.json'), `${JSON.stringify({ adapter, loaded, failures, rendered, texture, errors }, null, 2)}\n`);
  assert.equal(failures.length, 0, JSON.stringify(failures));
  assert.equal(errors.length, 0, JSON.stringify(errors));
  console.log(`Hardware WebGPU: loaded ${loaded.length} catalog entries, rendered ${rendered.keys.length} fixtures, imported albedo/normal textures with no shader errors.`);
} finally {
  await browser.close();
}
