import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {
  FOREST_GENERATED_SPECIES,
  createForestSpeciesPrototypeGeometry,
} from '../src/editor/stylized/forest/ForestSpeciesGeometry.js';
import { createTreeProxyPrototype } from '../src/editor/stylized/lod/StylizedProxyGeometry.js';

const PROXY_CONFIG = Object.freeze({
  trees: Object.freeze({
    barkTint: '#6b4a30',
    leafTop: '#65a653',
  }),
});

function horizontalDiameter(geometry) {
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new THREE.Vector3());
  return Math.max(size.x, size.z);
}

function disposeProxy(proxy) {
  for (const part of proxy.proxyParts) {
    part.geometry.dispose();
    part.material.dispose();
  }
}

test('snow-painted crowns stay pale in the loading proxy instead of becoming green', () => {
  const parts = [
    { kind: 'trunk', geometry: new THREE.CylinderGeometry(0.2, 0.3, 3) },
    { kind: 'leaf', geometry: new THREE.ConeGeometry(1, 4) },
  ];
  const leaf = parts[1].geometry;
  leaf.translate(0, 3, 0);
  const colors = new Float32Array(leaf.attributes.position.count * 3).fill(0.8);
  leaf.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const proxy = createTreeProxyPrototype(parts, PROXY_CONFIG);
  try {
    const color = proxy.proxyParts.find(part => part.kind === 'leaf').material.color;
    assert.ok(Math.abs(color.r - 0.8) < 1e-6 && Math.abs(color.g - 0.8) < 1e-6 && Math.abs(color.b - 0.8) < 1e-6);
  } finally { disposeProxy(proxy); parts.forEach(part => part.geometry.dispose()); }
});

test('tree proxies keep branch extents out of the low-LOD trunk diameter', () => {
  const prototypes = createForestSpeciesPrototypeGeometry(FOREST_GENERATED_SPECIES);
  try {
    for (const prototype of prototypes) {
      const proxy = createTreeProxyPrototype(prototype.parts, PROXY_CONFIG);
      try {
        const canopy = proxy.proxyParts.find((part) => part.kind === 'leaf');
        const trunk = proxy.proxyParts.find((part) => part.kind === 'trunk');
        const canopyDiameter = horizontalDiameter(canopy.geometry);

        assert.equal(
          proxy.fallbackImpostorParts,
          undefined,
          `${prototype.speciesId} must reuse proxyParts for loading fallback`,
        );
        assert.ok(
          horizontalDiameter(trunk.geometry) <= canopyDiameter * 0.16,
          `${prototype.speciesId} proxy trunk is wider than 16% of its canopy`,
        );
        const connector = canopy.geometry.userData.trunkConnectorBounds;
        trunk.geometry.computeBoundingBox();
        const trunkBounds = trunk.geometry.boundingBox;
        const connectorContainsTrunkAxis = (
          trunkBounds.getCenter(new THREE.Vector3()).x >= connector.min[0]
          && trunkBounds.getCenter(new THREE.Vector3()).x <= connector.max[0]
          && trunkBounds.getCenter(new THREE.Vector3()).z >= connector.min[2]
          && trunkBounds.getCenter(new THREE.Vector3()).z <= connector.max[2]
        );
        const connectorOverlapsTrunk = (
          Math.min(connector.max[1], trunkBounds.max.y)
          > Math.max(connector.min[1], trunkBounds.min.y)
        );
        assert.ok(
          connectorContainsTrunkAxis && connectorOverlapsTrunk,
          `${prototype.speciesId} proxy crown must physically cover the trunk attachment`,
        );
      } finally {
        disposeProxy(proxy);
      }
    }
  } finally {
    for (const prototype of prototypes) {
      for (const part of prototype.parts) part.geometry.dispose();
    }
  }
});
