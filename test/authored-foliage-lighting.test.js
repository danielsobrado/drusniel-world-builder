import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three/webgpu';
import { cloneAuthoredNodeMaterial, applyUnderstoryPalette } from '../src/editor/stylized/AuthoredFoliageMaterial.js';
import { cloneBushMaterial, createBushProxyMaterial } from '../src/editor/stylized/BushRenderAssets.js';

test('unlit outdoor plants acquire lighting without losing their authored paint or cutout', () => {
  const map = new THREE.Texture(), alphaMap = new THREE.Texture();
  map.offset.set(.2, .4); map.repeat.set(8.7, 6.6);
  const source = new THREE.MeshBasicMaterial({ color: '#bb6622', map, alphaMap,
    side: THREE.DoubleSide, alphaTest: .42, opacity: .8, vertexColors: true });
  const material = cloneAuthoredNodeMaterial(source, { lit: true });
  assert.ok(material.isMeshLambertNodeMaterial && material.lights);
  assert.deepEqual(material.color.toArray(), source.color.toArray());
  for (const key of ['map', 'alphaMap', 'side', 'alphaTest', 'opacity', 'vertexColors']) assert.equal(material[key], source[key]);
  assert.deepEqual(material.map.repeat.toArray(), [8.7, 6.6]);
  assert.equal(source.type, 'MeshBasicMaterial', 'source asset remains unchanged');
  assert.equal(material.emissive.getHex(), 0);
});

test('promotion also enables lights on an existing basic node material', () => {
  const source = new THREE.MeshBasicNodeMaterial({ color: '#229944' });
  const material = cloneAuthoredNodeMaterial(source, { lit: true });
  assert.ok(material.isMeshLambertNodeMaterial && material.lights);
  assert.deepEqual(material.color.toArray(), source.color.toArray());
});

test('generic cloning retains intentional unlit materials', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#666666' });
  const material = cloneAuthoredNodeMaterial(source);
  assert.ok(material.isMeshBasicNodeMaterial);
  assert.notEqual(material.isMeshLambertNodeMaterial, true);
});

test('authored bush and proxy representations both use scene lighting', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#448822' });
  assert.ok(cloneBushMaterial(source).isMeshLambertNodeMaterial);
  assert.ok(createBushProxyMaterial(source).isMeshLambertNodeMaterial);
});

test('authored plants and both bush representations share the optional cloud shadow contract', () => {
  const source = new THREE.MeshBasicMaterial({ color: '#448822' });
  for (const enabled of [false, true]) {
    const config = { sky: { cloudShadows: { enabled }, cloudScale: 1, cloudSpeed: .1, cloudWorldScale: 1 } };
    const authored = applyUnderstoryPalette(cloneAuthoredNodeMaterial(source, { lit: true }), config);
    const near = cloneBushMaterial(source, { config }), proxy = createBushProxyMaterial(source, { config });
    for (const material of [authored, near, proxy]) {
      assert.equal(!!material.userData.cloudShadow, enabled);
      assert.equal(typeof material.receivedShadowNode === 'function', enabled);
    }
  }
});
