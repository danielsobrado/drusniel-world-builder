import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import {
  BUSH_CAST_SHADOW,
  BUSH_PROXY_TRIANGLES,
  cloneBushMaterial,
  createBushProxyPrototype,
  resolveBushProxyProfile,
} from '../src/editor/stylized/BushRenderAssets.js';
import { groundGeometry } from '../src/editor/stylized/StylizedPrototypeBake.js';
import { createSourceOpacityNode } from '../src/editor/stylized/lod/StylizedDitheredMaterial.js';

function triangleCount(geometry) {
  return geometry.getIndex()
    ? geometry.getIndex().count / 3
    : geometry.getAttribute('position').count / 3;
}

function sizeOf(geometry) {
  geometry.computeBoundingBox();
  return geometry.boundingBox.getSize(new THREE.Vector3());
}

test('grounding preserves authored foliage normals', () => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -1, 1, 0,
    1, 1, 0,
    -1, 3, 0,
    1, 3, 0,
  ], 3));
  geometry.setIndex([0, 1, 2, 2, 1, 3]);
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
  ], 3));
  const authored = [...geometry.getAttribute('normal').array];

  groundGeometry(geometry);

  assert.deepEqual([...geometry.getAttribute('normal').array], authored);
  geometry.dispose();
});

test('bush materials retain authored texture channels and use cutout rendering', () => {
  const map = new THREE.Texture();
  const alphaMap = new THREE.Texture();
  const normalMap = new THREE.Texture();
  const source = new THREE.MeshStandardMaterial({
    map,
    alphaMap,
    normalMap,
    opacity: 0.8,
    transparent: true,
    alphaTest: 0.1,
    side: THREE.FrontSide,
  });

  const material = cloneBushMaterial(source);

  assert.notEqual(material, source);
  assert.equal(material.isNodeMaterial, true);
  assert.ok(material.colorNode);
  assert.equal(material.map, map);
  assert.equal(material.alphaMap, alphaMap);
  assert.equal(material.normalMap, normalMap);
  assert.equal(material.side, THREE.DoubleSide);
  assert.equal(material.transparent, false);
  assert.equal(material.opacity, 0.8);
  assert.equal(material.depthWrite, true);
  assert.ok(material.alphaTest >= 0.35);
  assert.ok(createSourceOpacityNode(material));
  assert.equal(
    createSourceOpacityNode({ map }).node.uvNode,
    null,
    'optimized glTF texture transforms require an implicit UV node',
  );

  material.dispose();
  source.dispose();
  map.dispose();
  alphaMap.dispose();
  normalMap.dispose();
});

test('bush proxies use fitted volumetric foliage clusters', () => {
  const geometry = new THREE.SphereGeometry(1, 24, 12);
  geometry.scale(1.4, 0.8, 0.9);
  geometry.translate(0, 0.8, 0);
  geometry.computeBoundingBox();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const source = {
    geometry,
    material,
    kind: 'bush',
    height: 1.6,
    prototypeId: 'test-bush',
  };

  const proxy = createBushProxyPrototype(source, { color: '#557744' });
  const sourceSize = sizeOf(geometry);
  const proxySize = sizeOf(proxy.geometry);

  assert.equal(triangleCount(proxy.geometry), BUSH_PROXY_TRIANGLES);
  assert.ok(triangleCount(proxy.geometry) < triangleCount(geometry));
  assert.ok(proxySize.distanceTo(sourceSize) < 1e-6);
  assert.equal(proxy.geometry.userData.proxyKind, 'clustered-low-poly-canopy');
  assert.ok(proxy.material.colorNode);
  assert.equal(proxy.material.flatShading, true);
  assert.equal(BUSH_CAST_SHADOW, false);

  proxy.geometry.dispose();
  proxy.material.dispose();
  geometry.dispose();
  material.dispose();
});

test('savanna thorn, boreal juniper, and wetland buttonbush get distinct 100-triangle proxy silhouettes', () => {
  assert.equal(resolveBushProxyProfile('/assets/bushes/bush-arid-rooibos-01.glb'), 'savannaThorn');
  assert.equal(resolveBushProxyProfile('/assets/bushes/bush-boreal-juniper-01.glb'), 'borealJuniper');
  assert.equal(resolveBushProxyProfile('/assets/bushes/bush-swamp-buttonbush-01.glb'), 'swampButtonbush');
  assert.equal(resolveBushProxyProfile('/assets/bushes/bush.glb'), 'default');

  const geometry = new THREE.BoxGeometry(2.2, 1.4, 2.0);
  geometry.translate(0, 0.7, 0);
  geometry.computeBoundingBox();
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff' });
  const sourceSize = sizeOf(geometry);

  const hashes = new Set();
  for (const scenePath of [
    '/assets/bushes/bush-arid-rooibos-01.glb',
    '/assets/bushes/bush-boreal-juniper-01.glb',
    '/assets/bushes/bush-swamp-buttonbush-01.glb',
  ]) {
    const proxy = createBushProxyPrototype({
      geometry,
      material,
      kind: 'bush',
      height: 1.4,
      prototypeId: 'test',
      scenePath,
    }, { color: '#557744' });
    assert.equal(triangleCount(proxy.geometry), BUSH_PROXY_TRIANGLES);
    assert.ok(sizeOf(proxy.geometry).distanceTo(sourceSize) < 1e-5);
    const pos = proxy.geometry.getAttribute('position').array;
    hashes.add([...pos.slice(0, 24)].map((v) => v.toFixed(3)).join(','));
    proxy.geometry.dispose();
    proxy.material.dispose();
  }
  assert.equal(hashes.size, 3);
  geometry.dispose();
  material.dispose();
});
