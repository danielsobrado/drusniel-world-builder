import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSeaSurf, sampleSeaHeightCpu, seaSurfPatternFrames } from '../src/editor/water/SeaSurf.js';
import { resolveSeaDetail, seaDetailPatternFrames, seaDetailLayers } from '../src/editor/water/SeaDetailPolicy.js';
import { PatternOrigins, wrapPeriodic } from '../src/editor/stylized/PatternOrigins.js';
import { SEA_SWELL_COMPONENTS, sampleSeaSwellCpu, seaWaveShape } from '../src/editor/water/SeaSwell.js';

const settings = resolveSeaSurf({ enabled: true });
test('wrapped shader surf coordinates agree with swimming heights across distant chunk boundaries', () => {
  const x = -4226432, z = 278528, time = 127.3, depth = 2;
  const wave = SEA_SWELL_COMPONENTS[0];
  function shaderHeight(cx, cz, dx, dz) {
    const origins = new PatternOrigins(seaSurfPatternFrames(settings)); origins.update(cx, cz);
    const frames = origins.frames;
    const phaseAt = name => origins.uniforms[name].value + dx * frames[name].wave[0] + dz * frames[name].wave[1];
    const phase = wave.phase + (time * wave.angularSpeed) % (Math.PI * 2);
    const along = phaseAt('surfAlong');
    const group = phaseAt('surfGroup') + (time * wave.angularSpeed * settings.setGroup) % (Math.PI * 2);
    const set = 1 - settings.setDepth * (Math.sin(group + Math.sin(along) * 1.6) * 0.5 + 0.5);
    return seaWaveShape(phase + Math.sin(along) * settings.phaseWarp + depth * settings.depthPhaseScale, 0.45) * set;
  }
  const west = shaderHeight(x, z, 64, 0), east = shaderHeight(x + 128, z, -64, 0);
  assert.ok(Math.abs(west - east) < 1e-8);
  assert.ok(Math.abs(west - sampleSeaHeightCpu(x + 64, z, depth, time, 0.3, settings)) < 1e-8);
  assert.equal(sampleSeaHeightCpu(x, z, 30, time, 0.3, settings), sampleSeaSwellCpu(x, z, time, 0.3), 'offshore is the original swell');
});

test('every rotated ripple train preserves UV phase across a wrap and an origin rebase', () => {
  const detail = resolveSeaDetail({ enabled: true });
  const frames = seaDetailPatternFrames(detail), a = new PatternOrigins(frames), b = new PatternOrigins(frames);
  a.update(-9000000, 6000000); b.update(-9000000 + 128, 6000000);
  for (const [name, frame] of Object.entries(frames)) {
    for (let axis = 0; axis < 2; axis++) {
      const left = a.uniforms[name].value.getComponent(axis) + 64 * frame.basis[axis][0];
      const right = b.uniforms[name].value.getComponent(axis) - 64 * frame.basis[axis][0];
      assert.ok(Math.abs(wrapPeriodic(left - right + 0.5, 1) - 0.5) < 1e-8);
    }
  }
  const before = a.uniforms.seaDetail0.value.toArray();
  a.update(-9000000, 6000000); assert.deepEqual(a.uniforms.seaDetail0.value.toArray(), before);
  const layers = seaDetailLayers(detail);
  assert.equal(layers.length, 6); assert.notEqual(layers[0].speed, layers[2].speed);
});

test('surf and ripple policies reject malformed or unbounded input', () => {
  assert.throws(() => resolveSeaSurf({ fadeEnd: 1 }), /fadeEnd/);
  assert.throws(() => resolveSeaSurf({ setDepth: 1 }), /bounds/);
  assert.throws(() => resolveSeaSurf({ strength: Infinity }), /strength/);
  assert.throws(() => resolveSeaDetail({ fineDistance: 400 }), /bounds/);
  assert.throws(() => resolveSeaDetail({ textureWorldScale: 0 }), /textureWorldScale/);
});

test('nearshore crests travel into decreasing depth regardless of coast orientation', () => {
  const surf = resolveSeaSurf({ enabled: true, setDepth: 0, phaseWarp: 0 });
  const wave = SEA_SWELL_COMPONENTS[0], dt = 0.2, depth = 2;
  const time = (Math.PI / 2 + 2 * Math.PI - depth * surf.depthPhaseScale - wave.phase) / wave.angularSpeed;
  const nextDepth = depth - dt * wave.angularSpeed / surf.depthPhaseScale;
  const before = sampleSeaHeightCpu(0, 0, depth, time, 0.3, surf);
  const after = sampleSeaHeightCpu(10000, -20000, nextDepth, time + dt, 0.3, surf);
  assert.ok(nextDepth < depth); assert.ok(Math.abs(before - 1) < 1e-9);
  assert.ok(Math.abs(after - before) < 1e-9);
});
