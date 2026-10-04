import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { readGlbDocument } from './lib/gods-end-catalog.mjs';
import { createGodsEndObjectCatalog } from '../src/editor/assets/godsEnd/objectCatalog.js';
import { createObjectColliderDescriptions } from '../src/editor/ObjectColliderLibrary.js';
import { TILE_BY_KEY } from '../src/editor/tileCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const importedRoot = path.join(root, 'public/assets/gods-end');
const manifest = JSON.parse(await readFile(path.join(importedRoot, 'manifest.json'), 'utf8'));
const catalog = JSON.parse(await readFile(path.join(root, 'src/editor/assets/godsEnd/catalog.generated.json'), 'utf8'));
assert.equal(manifest.version, 1);
assert.equal(catalog.version, 1);
const imported = new Set(manifest.files.map((file) => path.resolve(root, file.output)));
let glbCount = 0;
for (const file of manifest.files) {
  const target = path.resolve(root, file.output);
  assert.ok(target.startsWith(`${importedRoot}${path.sep}`), `Invalid import path: ${file.output}.`);
  const bytes = await readFile(target);
  assert.equal(bytes.length, file.bytes, `Imported file size changed: ${file.output}.`);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `Imported checksum changed: ${file.output}.`);
  if (!target.endsWith('.glb')) continue;
  glbCount++;
  const document = readGlbDocument(bytes);
  for (const value of [...document.images ?? [], ...document.buffers ?? []]) {
    if (!value.uri || value.uri.startsWith('data:')) continue;
    assert.ok(!/^[a-z]+:/i.test(value.uri), `Non-local donor reference: ${value.uri}.`);
    const referenced = path.resolve(path.dirname(target), decodeURIComponent(value.uri));
    assert.ok(imported.has(referenced), `Missing donor dependency: ${value.uri} in ${file.output}.`);
  }
}
const config = yaml.load(await readFile(path.join(root, 'editor.config.yaml'), 'utf8'));
const definitions = createGodsEndObjectCatalog(catalog.objects, TILE_BY_KEY, config.map.tileSize);
assert.equal(definitions.length, manifest.objectCount);
assert.equal(catalog.textures.length, manifest.textureCount);
for (const definition of definitions) {
  createObjectColliderDescriptions(definition, config.map.tileSize);
  if (definition.asset.kind === 'house') continue;
  const target = path.join(root, 'public', definition.asset.path);
  assert.ok(imported.has(target), `Untracked object asset: ${definition.asset.path}.`);
  const document = readGlbDocument(await readFile(target));
  for (const name of definition.asset.rootNames) {
    assert.ok(document.nodes.some((node) => node.name === name), `Missing root ${name}.`);
  }
}
for (const texture of catalog.textures) assert.ok(imported.has(path.join(root, 'public', texture.path)));
console.log(`Validated ${glbCount} GLBs, ${definitions.length} placeable entries, ${catalog.textures.length} textures and every external GLB dependency.`);
