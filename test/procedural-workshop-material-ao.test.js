import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { MeshStandardMaterial, Texture, TextureLoader } from 'three/webgpu';
import { applyWorkshopPbrAssetMaps } from '../src/editor/workshop/ProceduralWorkshopPbrLoader.js';

const configSource = fs.readFileSync(
  new URL('../src/editor/workshop/ProceduralWorkshopMaterialConfig.js', import.meta.url),
  'utf8',
);
const controllerSource = fs.readFileSync(
  new URL('../src/editor/workshop/ProceduralWorkshopMaterialController.js', import.meta.url),
  'utf8',
);
const partsSource = fs.readFileSync(
  new URL('../src/editor/workshop/ProceduralWorkshopComponentParts.js', import.meta.url),
  'utf8',
);

test('workshop full-PBR presets expose ambient occlusion strength', () => {
  assert.match(configSource, /aoStrength:/);
  assert.match(configSource, /Material ambient occlusion strength/);
  assert.match(controllerSource, /data-material-field="aoStrength"/);
  assert.match(controllerSource, /result\.aoMapIntensity\s*=\s*preset\.aoStrength/);
});

test('workshop packed ORM drives AO, roughness and metalness', () => {
  assert.match(partsSource, /result\.aoMap\s*=\s*orm/);
  assert.match(partsSource, /result\.aoMapIntensity\s*=\s*preset\.aoStrength/);
  assert.match(partsSource, /result\.roughnessMap\s*=\s*orm/);
  assert.match(partsSource, /result\.metalnessMap\s*=\s*orm/);
});

test('late photo maps fill only material slots that have not been overridden', async (t) => {
  const originalImage = Object.getOwnPropertyDescriptor(globalThis, 'Image');
  Object.defineProperty(globalThis, 'Image', { configurable: true, value: class {} });
  t.after(() => {
    if (originalImage) Object.defineProperty(globalThis, 'Image', originalImage);
    else delete globalThis.Image;
  });
  const decoded = Promise.withResolvers();
  t.mock.method(TextureLoader.prototype, 'loadAsync', () => decoded.promise.then(() => new Texture()));
  const material = new MeshStandardMaterial();
  applyWorkshopPbrAssetMaps(material, {
    pbrAsset: { folder: 'test', set: 'deferred', maps: 'arm' },
    metalness: 0.5,
  });
  const albedo = new Texture(), orm = new Texture(), height = new Texture();
  material.map = albedo;
  material.aoMap = material.roughnessMap = material.metalnessMap = orm;
  material.bumpMap = height;
  decoded.resolve();
  await new Promise(setImmediate);
  assert.equal(material.map, albedo);
  assert.equal(material.aoMap, orm);
  assert.equal(material.roughnessMap, orm);
  assert.equal(material.metalnessMap, orm);
  assert.equal(material.bumpMap, height);
  assert.ok(material.normalMap?.name.endsWith('-normal'));
  material.dispose();
});
