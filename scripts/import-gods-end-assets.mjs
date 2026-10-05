import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogEntries, readGlbDocument } from './lib/gods-end-catalog.mjs';
import { createHouseCatalogEntries } from '../src/editor/assets/godsEnd/village/houseCatalog.js';
import { createAquaticCatalogEntries } from '../src/editor/assets/godsEnd/aquatic/aquaticCatalog.js';
import { createSeabedRockCatalogEntries } from '../src/editor/assets/godsEnd/seabed/seabedCatalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(process.argv.find((arg) => arg.startsWith('--source='))?.slice(9)
  ?? '/home/drusniel/drusniel-gods-end');
const check = process.argv.includes('--check');
const targetRoot = path.join(root, 'public/assets/gods-end');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function filesIn(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) files.push(...await filesIn(path.join(directory, entry.name), `${relative}/`));
    else if (entry.isFile()) files.push(relative);
  }
  return files.sort();
}

async function publish(relative, bytes) {
  const target = path.join(root, relative);
  if (check) {
    if (hash(await readFile(target)) !== hash(bytes)) throw new Error(`Imported asset differs: ${relative}.`);
    return;
  }
  // Refuse to silently overwrite locally edited imports on a subsequent run.
  const previous = oldManifest?.files.find((file) => file.output === relative);
  let existing;
  try { existing = await readFile(target); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (existing && previous && hash(existing) !== previous.sha256 && hash(existing) !== hash(bytes)) {
    throw new Error(`Locally edited import: ${relative}. Preserve that change before reimporting.`);
  }
  if (existing && hash(existing) === hash(bytes)) return;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, bytes);
}

let oldManifest;
try { oldManifest = JSON.parse(await readFile(path.join(targetRoot, 'manifest.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

const files = [];
const objects = [];
const textures = [];
const assetFiles = (await filesIn(path.join(source, 'public/Assets')))
  .filter((file) => !file.startsWith('Audio/') && !file.startsWith('fonts/'));
for (const relative of assetFiles) {
  const sourcePath = `Assets/${relative}`;
  const bytes = await readFile(path.join(source, 'public', sourcePath));
  const output = `public/assets/gods-end/${sourcePath}`;
  await publish(output, bytes);
  files.push({ source: `public/${sourcePath}`, output, bytes: bytes.length, sha256: hash(bytes) });
  if (relative.endsWith('.glb')) objects.push(...catalogEntries(sourcePath, readGlbDocument(bytes)));
  if (/\.(?:png|jpe?g|webp|hdr|ktx2)$/i.test(relative)) {
    textures.push({ name: relative, path: `assets/gods-end/${sourcePath}` });
  }
}

// Keep the source provenance beside the imported files.
for (const name of ['THIRD_PARTY_NOTICES.md', 'LICENSE', 'LICENSE.md']) {
  let bytes;
  try { bytes = await readFile(path.join(source, name)); }
  catch (error) { if (error.code === 'ENOENT') continue; throw error; }
  const output = `public/assets/gods-end/provenance/${name}`;
  await publish(output, bytes);
  files.push({ source: name, output, bytes: bytes.length, sha256: hash(bytes) });
}

// Both loaders use local files; relative image references in the donor GLBs stay intact.
for (const [directory, names] of [
  ['draco/gltf', ['draco_wasm_wrapper.js', 'draco_decoder.wasm', 'draco_decoder.js']],
  ['basis', ['basis_transcoder.js', 'basis_transcoder.wasm']],
]) {
  for (const name of names) {
    const input = `node_modules/three/examples/jsm/libs/${directory}/${name}`;
    const output = `public/assets/gods-end/decoders/${directory.startsWith('draco') ? 'draco' : 'basis'}/${name}`;
    const bytes = await readFile(path.join(root, input));
    await publish(output, bytes);
    files.push({ source: input, output, bytes: bytes.length, sha256: hash(bytes) });
  }
}
objects.push(...createHouseCatalogEntries());
objects.push(...createAquaticCatalogEntries());
objects.push(...createSeabedRockCatalogEntries());
const keys = new Set(objects.map((entry) => entry.key));
if (keys.size !== objects.length) throw new Error('Duplicate Gods’ End object keys.');
objects.sort((a, b) => a.key.localeCompare(b.key));
const catalog = { version: 1, objects, textures };
const manifest = { version: 1, sourceProject: 'drusniel-gods-end', files, objectCount: objects.length, textureCount: textures.length };
await publish('src/editor/assets/godsEnd/catalog.generated.json', Buffer.from(`${JSON.stringify(catalog, null, 2)}\n`));
await publish('public/assets/gods-end/manifest.json', Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
console.log(`${check ? 'Validated' : 'Imported'} ${assetFiles.length} donor files, ${objects.length} placeable objects and ${textures.length} texture assets.`);
