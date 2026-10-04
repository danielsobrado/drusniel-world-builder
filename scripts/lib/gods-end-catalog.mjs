import path from 'node:path';
import { Box3, Matrix4, Quaternion, Vector3 } from 'three';

export function readGlbDocument(bytes) {
  if (bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2) {
    throw new Error('Expected a GLB 2.0 asset.');
  }
  const length = bytes.readUInt32LE(12);
  if (bytes.toString('ascii', 16, 20) !== 'JSON') throw new Error('GLB has no JSON chunk.');
  return JSON.parse(bytes.toString('utf8', 20, 20 + length));
}

function localMatrix(node) {
  if (node.matrix) return new Matrix4().fromArray(node.matrix);
  return new Matrix4().compose(
    new Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
}

/** Bounds come from authored glTF accessors and transforms, without decoding meshes. */
export function authoredBounds(document, selectedIndices) {
  const selected = new Set(selectedIndices);
  const bounds = new Box3();
  const visit = (index, parentMatrix, inherited) => {
    const node = document.nodes[index];
    const matrix = parentMatrix.clone().multiply(localMatrix(node));
    const included = inherited || selected.has(index);
    if (included && Number.isInteger(node.mesh)) {
      for (const primitive of document.meshes[node.mesh].primitives) {
        const accessor = document.accessors[primitive.attributes.POSITION];
        if (!accessor.min || !accessor.max) throw new Error(`Missing authored bounds: ${node.name}.`);
        bounds.union(new Box3(new Vector3(...accessor.min), new Vector3(...accessor.max)).applyMatrix4(matrix));
      }
    }
    for (const child of node.children ?? []) visit(child, matrix, included);
  };
  for (const index of document.scenes[document.scene ?? 0].nodes ?? []) visit(index, new Matrix4(), false);
  if (bounds.isEmpty()) throw new Error('Selected asset has no renderable authored bounds.');
  return bounds;
}

const label = (value) => value.replace(/\.glb$/i, '').replaceAll(/[_-]+/g, ' ')
  .replace(/\b\w/g, (letter) => letter.toUpperCase());
const slug = (value) => value.toLowerCase().replace(/\.glb$/i, '').replace(/[^a-z0-9]+/g, '-');

/** Technical scene/LOD inputs remain in the archive, alongside the placeable content. */
export function catalogEntries(relativePath, document) {
  if (!relativePath.startsWith('Assets/terrain/')) return [];
  if (/\/(?:landscape|zones|colliders|vegetation-lods|scenes)\//.test(relativePath)
    || relativePath.endsWith('/sketchfab-world.glb')) return [];
  // These are represented by their original procedural designs in the same catalog.
  if (relativePath.includes('/structures/medieval/')) return [];
  const nodes = document.nodes;
  let roots;
  if (/\/(?:fantasy|trees)\/tree\d+\.glb$/.test(relativePath)) {
    roots = nodes.flatMap((node, index) => /_High$/.test(node.name ?? '') ? [[index]] : []);
  } else if (/\/(?:rocks|free_pack_-_rocks_stylized)\.glb$/.test(relativePath)) {
    roots = nodes.flatMap((node, index) => /^SM_Rocks_\d+$/.test(node.name ?? '') ? [[index]] : []);
  } else if (relativePath.includes('/understories/')) {
    roots = nodes.flatMap((node, index) => /^Plants_\d+$/.test(node.name ?? '') ? [[index]] : []);
  } else if (relativePath.endsWith('/fantasy/lantern.glb')) {
    roots = document.scenes[document.scene ?? 0].nodes.map((index) => [index]);
  } else if (relativePath.includes('/fauna/')) {
    roots = nodes.flatMap((node, index) => Number.isInteger(node.mesh) ? [[index]] : []);
  } else if (relativePath.includes('/foliage/')) {
    const parent = nodes.find((node) => node.name === 'RootNode');
    roots = (parent?.children ?? document.scenes[document.scene ?? 0].nodes).map((index) => [index]);
  } else {
    roots = [document.scenes[document.scene ?? 0].nodes];
  }
  const entries = [];
  for (const indices of roots) {
    const bounds = authoredBounds(document, indices);
    const name = roots.length > 1 ? nodes[indices[0]].name : path.basename(relativePath, '.glb');
    const bird = relativePath.includes('/fauna/');
    const tree = /\/(?:trees|fantasy)\/tree\d+\.glb$/.test(relativePath)
      || /(?:tree|palm|climber)_/.test(name) || /jungle_canopy_tree|palm_(?:tall|young)/.test(name);
    const rock = /rocks|\/props\/stone\.glb$/.test(relativePath);
    const prop = /\/(?:props|structures)\//.test(relativePath) || /lantern/.test(name);
    let scale = /\/(?:trees|fantasy|props)\//.test(relativePath) ? 1.8 / 5 : 1;
    if (rock) scale *= 7;
    if (relativePath.includes('/understories/')) scale = 1.25 / Math.max(0.01, bounds.max.y - bounds.min.y);
    if (relativePath.includes('/foliage/')) scale = 1.2 / Math.max(0.01, bounds.max.y - bounds.min.y);
    if (relativePath.endsWith('/structures/fence.glb')) scale = 0.01 * (1.8 / 5);
    if (relativePath.endsWith('/props/stone.glb')) scale = 3 / Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    if (relativePath.endsWith('/props/lantern.glb')) scale = 2.4 / Math.max(0.01, bounds.max.y - bounds.min.y);
    if (bird) scale = 0.7 / Math.max(bounds.max.x - bounds.min.x, bounds.max.z - bounds.min.z);
    const dimensions = bounds.getSize(new Vector3()).multiplyScalar(scale).toArray();
    entries.push({
      key: `gods-end-${slug(relativePath.slice('Assets/terrain/'.length))}${roots.length > 1 ? `-${slug(name)}` : ''}`,
      label: `Gods’ End ${bird ? `Bird ${entries.length + 1} (posed)` : label(name)}${relativePath.includes('/trees/') ? ' (original)' : ''}`,
      category: tree ? 'nature' : prop ? 'civic' : 'nature',
      icon: bird ? '🐦' : tree ? '🌳' : rock ? '🪨' : prop ? '🏮' : '🌿',
      color: tree ? '#587346' : rock ? '#8c8276' : prop ? '#ac824e' : '#648353',
      asset: {
        kind: 'glb', path: `assets/gods-end/${relativePath}`,
        rootNames: indices.map((index) => nodes[index].name).filter(Boolean),
        scale, bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, dimensions,
      },
      collision: tree ? 'trunk' : rock || prop ? 'bounds' : 'none',
    });
  }
  return entries;
}
