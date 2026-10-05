import assert from 'node:assert/strict';
import test from 'node:test';
import { pruneUnusedSamplerBindings } from '../src/render/UnusedSamplerBindings.js';
import BindGroup from 'three/src/renderers/common/BindGroup.js';

test('textureLoad-only sampler pruning keeps shader indices synchronized across stages', () => {
  const vertex = '@binding( 0 ) @group( 1 ) var unused_sampler : sampler;\n@binding( 1 ) @group( 1 ) var a : texture_2d<f32>;\ntextureLoad(a, vec2i(0), 0);';
  const fragment = `${vertex}\n@binding( 2 ) @group( 1 ) var used_sampler : sampler;\n@binding( 3 ) @group( 1 ) var b : texture_2d<f32>;\ntextureSample(b, used_sampler, vec2f(0));`;
  const group = new BindGroup('object', [{ isSampler: true, name: 'unused_sampler' }, { name: 'a' }, { isSampler: true, name: 'used_sampler' }, { name: 'b' }]);
  const builder = { vertexShader: vertex, fragmentShader: fragment, bindingsIndexes: { object: { group: 1 } }, getBindings: () => [group] };
  assert.equal(pruneUnusedSamplerBindings(builder), 1);
  assert.doesNotMatch(builder.fragmentShader, /unused_sampler/);
  assert.match(builder.fragmentShader, /@binding\( 1 \) @group\( 1 \) var used_sampler/);
  assert.match(builder.vertexShader, /@binding\( 0 \) @group\( 1 \) var a/);
  assert.deepEqual(builder.bindGroups[0].bindings.map(binding => binding.name), ['a', 'used_sampler', 'b']);
  assert.equal(group.bindings.length, 4, 'does not mutate a cached group owned by another build');
});
