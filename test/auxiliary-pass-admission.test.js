import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveRenderEnhancements } from '../src/config/RenderEnhancements.js';
import { FarCascadeAdmission } from '../src/render/shadows/FarCascadeAdmission.js';
import { ReflectionAdmission } from '../src/render/reflections/ReflectionAdmission.js';

const settings = resolveRenderEnhancements().auxiliaryPassBudget;
const fixture = () => {
  const near = { autoUpdate: true, needsUpdate: false, map: {} };
  const far = { autoUpdate: true, needsUpdate: false, map: { texture: { name: 'ShadowMap' } } };
  const cascades = { node: { lights: [{ shadow: near }, { shadow: far }] } };
  const camera = { position: { x: 0, y: 2, z: 0 }, quaternion: { x: 0, y: 0, z: 0, w: 1 },
    projectionMatrix: { elements: [1, 2, 3] }, layers: { mask: 1 } };
  const light = { position: { x: 0, y: 100, z: 0 }, target: { position: { x: 0, y: 0, z: 0 } } };
  const origin = { x: 0, z: 0 };
  const controller = new FarCascadeAdmission(settings);
  const begin = (now, pressure = false, revision = 'a') => controller.begin(cascades, camera, light, origin, revision, now, pressure);
  const finish = () => { far.needsUpdate = false; controller.end(); };
  return { near, far, cascades, camera, light, origin, controller, begin, finish };
};

test('far cascade reuse leaves near shadows unchanged and restores flags', () => {
  const f = fixture();
  f.begin(0);
  assert.equal(f.far.needsUpdate, true);
  assert.equal(f.far.autoUpdate, false);
  f.finish();
  f.begin(16);
  assert.equal(f.far.needsUpdate, false);
  assert.equal(f.near.autoUpdate, true);
  assert.equal(f.near.needsUpdate, false);
  f.finish();
  assert.equal(f.far.autoUpdate, true);
  f.begin(33);
  assert.equal(f.far.needsUpdate, true);
  f.finish();
});

test('pressure extends far reuse only to the configured deadline', () => {
  const f = fixture();
  f.begin(0); f.finish();
  f.begin(99, true);
  assert.equal(f.far.needsUpdate, false);
  f.finish();
  f.begin(100, true);
  assert.equal(f.far.needsUpdate, true);
  f.finish();
});

test('camera displacement, orientation, sun direction and projection invalidate cached far shadows', () => {
  const f = fixture();
  f.begin(0); f.finish();
  f.camera.position.x = 0.6;
  f.begin(1, true); assert.equal(f.far.needsUpdate, true); f.finish();
  f.camera.quaternion.y = Math.sin(Math.PI / 180);
  f.camera.quaternion.w = Math.cos(Math.PI / 180);
  f.begin(2, true); assert.equal(f.far.needsUpdate, true); f.finish();
  f.light.position.x = 1;
  f.begin(3, true); assert.equal(f.far.needsUpdate, true); f.finish();
  f.camera.projectionMatrix.elements[0] = 2;
  f.begin(4, true); assert.equal(f.far.needsUpdate, true); f.finish();
  f.camera.layers.mask = 3;
  f.begin(5, true); assert.equal(f.far.needsUpdate, true); f.finish();
});

test('origin, scene revisions, replacement map and external dirty flag force refresh', () => {
  const f = fixture();
  f.begin(0); f.finish();
  f.origin.x = 128;
  f.camera.position.x = -128;
  f.begin(1, true); assert.equal(f.far.needsUpdate, true); f.finish();
  f.begin(2, true, 'b'); assert.equal(f.far.needsUpdate, true); f.finish();
  f.far.map = {};
  f.begin(3, true, 'b'); assert.equal(f.far.needsUpdate, true); f.finish();
  f.far.needsUpdate = true;
  f.begin(4, true, 'b'); assert.equal(f.far.needsUpdate, true); f.finish();
});

test('failed or unconsumed main draw restores flags and requires another refresh', () => {
  const f = fixture();
  f.begin(0);
  f.controller.end(false);
  assert.equal(f.far.autoUpdate, true);
  assert.equal(f.far.needsUpdate, true);
  f.begin(1);
  f.controller.end();
  assert.equal(f.far.needsUpdate, true);
  f.begin(2); f.finish();
  f.begin(3);
  f.controller.dispose();
  assert.equal(f.far.autoUpdate, true);
  assert.equal(f.far.needsUpdate, true);
});

test('single cascade, uninitialized map or externally disabled updates are untouched', () => {
  const f = fixture();
  f.cascades.node.lights.pop();
  f.begin(0);
  assert.equal(f.near.autoUpdate, true);
  assert.equal(f.near.needsUpdate, false);
  f.cascades.node.lights.push({ shadow: f.far });
  f.far.map = null;
  f.begin(1);
  assert.equal(f.far.autoUpdate, true);
  f.far.map = {};
  f.far.autoUpdate = false;
  f.begin(2);
  assert.equal(f.far.autoUpdate, false);
  assert.equal(f.far.needsUpdate, false);
});

const request = (now, overrides = {}) => ({ now, due: true, kind: 'cube', invalid: false,
  partial: false, estimate: 1, contended: false, gpuBusy: false, ...overrides });

test('cheap due captures remain eligible; non-turns and inland frames do not capture', () => {
  const admission = new ReflectionAdmission(settings);
  assert.equal(admission.allow(request(0)), true);
  admission.captured();
  assert.equal(admission.allow(request(10, { turn: false })), false);
  assert.equal(admission.allow(request(20, { due: false })), false);
  assert.equal(admission.wait, null);
});

test('cube and planar capture costs have independent budgets', () => {
  const admission = new ReflectionAdmission(settings);
  assert.equal(admission.allow(request(0, { estimate: 1.75 })), false);
  assert.equal(admission.allow(request(1, { kind: 'planar', estimate: 1.75 })), true);
  admission.captured();
  assert.equal(admission.allow(request(2, { kind: 'planar', estimate: 3 })), false);
  assert.equal(admission.allow(request(252, { kind: 'planar', estimate: 3 })), true);
});

test('initial and partial cube captures have shorter deferral; GPU busy never bypassed', () => {
  for (const urgent of [{ invalid: true }, { partial: true }]) {
    const admission = new ReflectionAdmission(settings);
    assert.equal(admission.allow(request(0, { contended: true, ...urgent })), false);
    assert.equal(admission.allow(request(79, { contended: true, ...urgent })), false);
    assert.equal(admission.allow(request(80, { contended: true, ...urgent })), true);
    assert.equal(admission.allow(request(1000, { contended: true, gpuBusy: true, ...urgent })), false);
  }
});

test('deferral measures due time across stride turns and recovers after invalidation', () => {
  const admission = new ReflectionAdmission(settings);
  assert.equal(admission.allow(request(0, { contended: true, turn: false })), false);
  assert.equal(admission.allow(request(249, { contended: true })), false);
  assert.equal(admission.allow(request(250, { contended: true })), true);
  admission.captured();
  assert.equal(admission.allow(request(251, { contended: true })), false);
  assert.equal(admission.allow(request(252, { due: false })), false);
  assert.equal(admission.allow(request(300, { contended: true })), false);
});

test('flags default off, can be selected independently, and validate freshness ordering', () => {
  assert.equal(resolveRenderEnhancements().farShadowAdmission, false);
  assert.equal(resolveRenderEnhancements().reflectionAdmission, false);
  const shadow = resolveRenderEnhancements({}, '?farShadowAdmission=1');
  assert.equal(shadow.farShadowAdmission, true);
  assert.equal(shadow.reflectionAdmission, false);
  assert.equal(resolveRenderEnhancements({}, '?reflectionAdmission=1').reflectionAdmission, true);
  assert.throws(() => resolveRenderEnhancements({ auxiliaryPassBudget: { farShadowIntervalMs: 200 } }), RangeError);
  assert.throws(() => resolveRenderEnhancements({ auxiliaryPassBudget: { reflectionUrgentDeferralMs: 500 } }), RangeError);
});
