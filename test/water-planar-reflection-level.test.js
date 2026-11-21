import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// The planar reflection belongs to one water body. Gating it on the displaced surface
// (positionWorld.y) drew the swell's height contours as bright winding ribbons over the
// sea, and capturing the mirror at the instantaneous swell height made them jump.

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('planar reflection is gated and captured at the still water level, never the waves', async () => {
  const controller = await read('../src/render/reflections/WaterReflectionController.js');
  const material = await read('../src/editor/stylized/StylizedWaterMaterial.js');
  assert.match(controller, /abs\(surfaceLevel\.sub\(this\.planarHeight\)\)/);
  assert.doesNotMatch(controller, /abs\(positionWorld\.y\.sub\(this\.planarHeight\)\)/);
  assert.match(controller, /const water = staticWaterAt\(this\.view, d\.centerWorldX, d\.centerWorldZ\);/);
  assert.match(material, /const stillLevel = waterField\.g\.add\(waterSurfaceOrigin\);/);
  assert.equal((material.match(/, stillLevel\)/g) ?? []).length, 2, 'sea and river reflections both pass the still level');
});

test('foam breakup evolves faster but stays seamless: every drift wraps by the noise period', async () => {
  const surf = await read('../src/editor/stylized/SeaSurfNodes.js');
  assert.match(surf, /const FOAM_WARP_RATE = \[0\.093, 0\.069\];/);
  assert.match(surf, /time\.mul\(FOAM_FINE_DRIFT\[0\]\)\.mod\(512\), time\.mul\(FOAM_FINE_DRIFT\[1\]\)\.mod\(512\)/);
});
