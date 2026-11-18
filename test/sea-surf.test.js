import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSeaSurf, sampleSeaHeightCpu, sampleSeaSurfDisplacementCpu, seaSurfPatternFrames } from '../src/editor/water/SeaSurf.js';
import { directionalCarriers, evaluateDirectionalSurfCpu, solveSurfWaveNumber } from '../src/editor/water/SeaSurfMath.js';
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

test('foam lattice and independent warp phases agree at both chunk borders at planet scale', () => {
  const frames = seaSurfPatternFrames(settings);
  for (const center of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    for (const delta of [[64, 0], [0, 64]]) {
      const a = new PatternOrigins(frames), b = new PatternOrigins(frames);
      a.update(...center); b.update(center[0] + delta[0], center[1] + delta[1]);
      for (const name of ['surfLaceWarpX', 'surfLaceWarpZ']) {
        const wave = frames[name].wave;
        const phaseA = a.uniforms[name].value + delta[0] * .5 * wave[0] + delta[1] * .5 * wave[1];
        const phaseB = b.uniforms[name].value - delta[0] * .5 * wave[0] - delta[1] * .5 * wave[1];
        assert.ok(Math.abs(Math.sin(phaseA) - Math.sin(phaseB)) < 1e-8, name);
      }
      for (let axis = 0; axis < 2; axis++) {
        const gap = a.uniforms.surfLace.value.getComponent(axis) - b.uniforms.surfLace.value.getComponent(axis) + delta[axis] * settings.laceScale;
        assert.ok(Math.abs(wrapPeriodic(gap + 256, 512) - 256) < 1e-8);
      }
    }
  }
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

const directional = resolveSeaSurf({ enabled: true, model: 'directionalBreakers' });
const seaFixture = { amplitude: 0.9, stormScale: 1.65 };

test('directional phase propagates shoreward regardless of depth gradient', () => {
  const s = 14, dt = 0.25, wave = directionalCarriers[0];
  const k = directional.directional.waveNumbers[0];
  const closer = s - dt * wave.angularSpeed / k;
  const phase = (distance, t) => wave.phase + t * wave.angularSpeed + distance * k;
  assert.ok(closer < s);
  assert.ok(Math.abs(phase(s, 5) - phase(closer, 5 + dt)) < 1e-10);
  const x = -4226432, z = 278528, depth = 1.75;
  const a = evaluateDirectionalSurfCpu(x, z, depth, s, 1, directional, seaFixture, 0.2, 1);
  const b = evaluateDirectionalSurfCpu(x, z, depth, s + 5, 1, directional, seaFixture, 0.2, 1);
  assert.notEqual(a.height, b.height, 'shoreline distance affects crest position even on a flat shelf');
});

test('shoaling produces bounded breaking in shallow water', () => {
  const input = depth => evaluateDirectionalSurfCpu(12, -7, depth, 30,
    3.4, directional, seaFixture, 0, 1);
  const deep = input(15);
  const surf = input(1);
  const thin = input(0.1);
  assert.equal(deep.breaking, 0);
  assert.ok(surf.breaking > deep.breaking);
  for (const depth of [0.1, 0.25, 0.5, 1, 2, 4, 7, 15]) {
    const v = input(depth);
    assert.ok(Number.isFinite(v.height) && Number.isFinite(v.amplitude) && Number.isFinite(v.breaking));
    assert.ok(v.breaking >= 0 && v.breaking <= 1);
    assert.ok(v.amplitude <= directional.breaking.gamma * depth * 0.5 + 1e-12);
  }
  assert.ok(thin.amplitude < surf.amplitude);
  assert.deepEqual(input(0), { height: 0, amplitude: 0, breaking: 0 });
});

test('wave-number solver preserves finite-depth dispersion target', () => {
  for (const wave of directionalCarriers) {
    const k = solveSurfWaveNumber(wave.waveNumber, directional.directional.referenceDepthMeters);
    assert.ok(k >= wave.waveNumber);
    assert.ok(Math.abs(k * Math.tanh(k * directional.directional.referenceDepthMeters)
      - wave.waveNumber) < 1e-9);
  }
});

test('directional wave origins and packet phases are continuous on planet-scale chunk borders', () => {
  const frames = seaSurfPatternFrames(directional);
  for (const center of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    for (const delta of [[128, 0], [0, 128]]) {
      const a = new PatternOrigins(frames), b = new PatternOrigins(frames);
      a.update(...center);
      b.update(center[0] + delta[0], center[1] + delta[1]);
      for (let i = 0; i < directionalCarriers.length; i++) {
        for (const name of [`surfOblique${i}`, `surfPacketA${i}`, `surfPacketB${i}`]) {
          const frame = frames[name].wave;
          const left = a.uniforms[name].value + 0.5 * (delta[0] * frame[0] + delta[1] * frame[1]);
          const right = b.uniforms[name].value - 0.5 * (delta[0] * frame[0] + delta[1] * frame[1]);
          assert.ok(Math.abs(Math.sin(left) - Math.sin(right)) < 1e-8, name);
          assert.ok(Math.abs(Math.cos(left) - Math.cos(right)) < 1e-8, name);
        }
      }
    }
  }
});

test('directional surf retains exact legacy offshore displacement and obeys model selection', () => {
  for (const p of [[0, 0], [-4226432, 278528], [-9000000, 6000000]]) {
    for (const time of [0, 71.25, 3600.25]) {
      const depth = 20, storm = 0.4, exposure = 0.9, sharpness = 0.32;
      const offshore = seaFixture.amplitude * (1 + storm * (seaFixture.stormScale - 1));
      const expected = offshore * exposure * sampleSeaSwellCpu(...p, time, sharpness);
      const actual = sampleSeaSurfDisplacementCpu(...p, depth, 48, time,
        sharpness, directional, seaFixture, storm, exposure, offshore * exposure);
      assert.ok(Math.abs(expected - actual) < 1e-10);
    }
  }
  assert.equal(resolveSeaSurf({ enabled: true }).model, 'legacy');
  assert.throws(() => resolveSeaSurf({ enabled: true, model: 'unknown' }), /model/);
  assert.throws(() => resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
    breaking: { gamma: 0 } }), /gamma/);
  assert.throws(() => resolveSeaSurf({ enabled: true, model: 'directionalBreakers',
    directional: { carrierWeights: [1, -2, 3] } }), /carrierWeights/);
});
