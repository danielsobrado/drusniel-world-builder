import assert from 'node:assert/strict';
import test from 'node:test';
import { ShuffleBag, trimLoopPadding } from '../src/editor/audio/audio_variations.js';
import { AmbientOneShots, listenerRelative } from '../src/editor/audio/ambient_one_shots.js';
import { SampleBank } from '../src/editor/audio/sample_bank.js';

test('variation bags exhaust the bank and never repeat across reshuffles', () => {
  const bag = new ShuffleBag(['a', 'b', 'c'], () => 0.2);
  let last;
  for (let cycle = 0; cycle < 10; cycle++) {
    const sequence = Array.from({ length: 3 }, () => bag.next());
    assert.equal(new Set(sequence).size, 3); assert.notEqual(sequence[0], last); last = sequence.at(-1);
  }
  assert.equal(new ShuffleBag([]).next(), null);
});

function buffer(channels, rate = 100) {
  return { length: channels[0].length, numberOfChannels: channels.length, sampleRate: rate,
    duration: channels[0].length / rate, getChannelData: i => channels[i] };
}
test('loop trimming retains stereo transients and respects a bounded padding search', () => {
  const context = { createBuffer: (n, frames, rate) => buffer(Array.from({ length: n }, () => new Float32Array(frames)), rate) };
  const source = buffer([new Float32Array([0, 0, 1, 0, 0]), new Float32Array([0, 0.5, 0, 0, 0])]);
  const trimmed = trimLoopPadding(source, context);
  assert.equal(trimmed.length, 2); assert.deepEqual([...trimmed.getChannelData(1)], [0.5, 0]);
  assert.equal(source.length, 5, 'one-shot buffers stay intact');
  const long = buffer([new Float32Array(20000)]);
  assert.equal(trimLoopPadding(long, context).length, 20000 - 8192);
});

test('spatial calls stay anchored during camera movement and canonical rebasing', () => {
  const point = { x: 3000030, y: 8, z: -2000000 };
  const listener = { x: 3000000, y: 3, z: -2000000, yaw: 0 };
  assert.deepEqual(listenerRelative(listener, point), { x: 30, y: 5, z: 0 });
  assert.ok(Math.abs(listenerRelative({ ...listener, yaw: Math.PI / 2 }, point).z - 30) < 1e-9);
  assert.deepEqual(listenerRelative({ ...listener, x: listener.x + 10 }, point), { x: 20, y: 5, z: 0 });
});

test('environment calls have bounded voices, sea-only placements and disposal cleanup', () => {
  const played = [], ended = [], positions = [];
  const bank = { load() {}, playVoice(path, options) {
    played.push({ path, options }); ended.push(options.onEnded);
    return { setVolume() {}, setPosition: p => positions.push(p), stop: options.onEnded };
  } };
  const calls = new AmbientOneShots({ bank, random: () => 0.5,
    definitions: { waves: { samples: ['a', 'b'], interval: [0.01, 0.01], volume: 1, bearing: 'sea' } } });
  const listener = { x: 1000000, y: 2, z: 0, yaw: 0 };
  calls.update({ waves: 1 }, 1, listener, {}, []); assert.equal(played.length, 0);
  const seaPoints = [{ x: 1000040, y: 0, z: 0 }];
  for (let i = 0; i < 10; i++) calls.update({ waves: 1 }, 1, listener, {}, seaPoints);
  assert.equal(played.length, 2); assert.equal(calls.active.size, 2);
  assert.deepEqual(played[0].options.position, { x: 40, y: -2, z: 0 });
  calls.update({ waves: 1 }, 1, { ...listener, x: 1000010 }, {}, seaPoints);
  assert.deepEqual(positions.at(-1), { x: 30, y: -2, z: 0 });
  ended[0](); calls.update({ waves: 1 }, 1, listener, {}, seaPoints);
  assert.equal(played.length, 3); assert.notEqual(played[1].path, played[2].path);
  calls.dispose(); assert.equal(calls.active.size, 0);
});

test('decoded audio is shared, loops trim once, and spatial voices disconnect on completion', async () => {
  let decodes = 0, trims = 0, disconnected = 0, lastSource, panner;
  const node = () => ({ connect() {}, disconnect() { disconnected++; } });
  const original = buffer([new Float32Array([0, 1, 0])]);
  const context = { decodeAudioData: async () => { decodes++; return original; },
    createBuffer: (n, frames, rate) => { trims++; return buffer(Array.from({ length: n }, () => new Float32Array(frames)), rate); },
    createBufferSource: () => (lastSource = { ...node(), playbackRate: { value: 1 }, start() {}, stop() {} }),
    createGain: () => ({ ...node(), gain: { value: 1 } }),
    createPanner: () => (panner = { ...node(), positionX: {}, positionY: {}, positionZ: {} }) };
  const bank = new SampleBank({ getContext: () => context, getDestination: () => ({}), fetchBytes: async () => new ArrayBuffer(4) });
  await Promise.all([bank.load('a'), bank.load('a')]); assert.equal(decodes, 1);
  bank.loop('a'); bank.loop('a'); assert.equal(trims, 1); assert.equal(lastSource.buffer.length, 1);
  const voice = bank.playVoice('a', { position: { x: 4, y: 3, z: -2 } });
  assert.equal(lastSource.buffer, original); assert.equal(panner.positionX.value, 4);
  voice.setPosition({ x: 8, y: 0, z: 0 }); assert.equal(panner.positionX.value, 8);
  lastSource.onended(); assert.equal(disconnected, 3);
});
