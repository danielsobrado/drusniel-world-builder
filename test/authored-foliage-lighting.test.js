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

test('understory bushes and proxies receive GPU puff normals, wrapped diffuse, and soft cutout edges', () => {
  const map = new THREE.DataTexture(new Uint8Array([90, 160, 75, 255]), 1, 1);
  const source = new THREE.MeshBasicMaterial({ map, side: THREE.DoubleSide, alphaTest: 0.35 });
  const bounds = { min: [-0.6, 0, -0.6], max: [0.6, 1.8, 0.6] };
  const bush = cloneBushMaterial(source, { config: {}, height: 1.8, bounds });
  const proxy = createBushProxyMaterial(source, { config: {}, minimumHeight: 0, maximumHeight: 1.8, bounds });
  for (const material of [bush, proxy]) {
    assert.ok(material.foliageShapeNormalNode && material.foliageNormalBlendNode, 'GPU puff normal wired');
    assert.ok(material.foliageWrapDiffuseNode && material.foliageRimGlowNode, 'wrap diffuse and rim glow wired');
  }
  assert.ok(bush.opacityNode, 'cutout bush cards carry GPU grazing fade opacity');
  assert.equal(proxy.flatShading, false, 'bush proxies shade smoothly as soft puffs');
});

test('lit plants are dielectric even when the glTF left metallicFactor at its default of 1', () => {
  const source = new THREE.MeshStandardMaterial({ color: '#448822', metalness: 1, metalnessMap: new THREE.Texture() });
  const material = cloneAuthoredNodeMaterial(source, { lit: true });
  assert.equal(material.metalness, 0);
  assert.equal(material.metalnessMap, null);
  assert.equal(source.metalness, 1, 'source asset remains unchanged');
  assert.equal(cloneAuthoredNodeMaterial(source).metalness, 1, 'unlit clones keep authored channels');
});
