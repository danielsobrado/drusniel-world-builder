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

test('shared texture declarations use the deduplicated binding in both shader stages', () => {
  const group = new BindGroup('object', [{ isSampler: true, name: 'bed_sampler' },
    { name: 'bed' }, { name: 'object' }, { name: 'height' }]);
  const builder = {
    vertexShader: '@binding( 4 ) @group( 1 ) var height : texture_2d<f32>;\n'
      + '@binding( 2 ) @group( 1 )\nvar<uniform> object : ObjectStruct;\ntextureLoad(height, vec2i(0), 0);',
    fragmentShader: '@binding( 0 ) @group( 1 ) var bed_sampler : sampler;\n'
      + '@binding( 1 ) @group( 1 ) var bed : texture_2d<f32>;\n'
      + '@binding( 3 ) @group( 1 ) var height : texture_2d<f32>;\ntextureLoad(bed, vec2i(0), 0);',
    bindingsIndexes: { object: { group: 1 } }, getBindings: () => [group],
  };
  assert.equal(pruneUnusedSamplerBindings(builder), 1);
  for (const stage of ['vertexShader', 'fragmentShader']) {
    assert.match(builder[stage], /@binding\( 2 \) @group\( 1 \) var height/);
  }
  assert.match(builder.vertexShader, /@binding\( 1 \) @group\( 1 \)\nvar<uniform> object/);
  assert.doesNotMatch(builder.fragmentShader, /bed_sampler/);
  assert.deepEqual(builder.bindGroups[0].bindings.map(binding => binding.name), ['bed', 'object', 'height']);
});

test('uniform buffers keep their GPU binding when generated indices contain a shared texture gap', () => {
  const buffer = { name: 'UniformBuffer_42' };
  const group = new BindGroup('object', [{ isSampler: true, name: 'unused_sampler' },
    { name: 'height' }, buffer, { isSampler: true, name: 'detail_sampler' }, { name: 'detail' }]);
  const builder = {
    fragmentShader: '@binding( 0 ) @group( 1 ) var unused_sampler : sampler;\n'
      + '@binding( 3 ) @group( 1 )\nvar<uniform> NodeBuffer_7 : BufferStruct;\n'
      + '@binding( 4 ) @group( 1 ) var detail_sampler : sampler;\n'
      + '@binding( 5 ) @group( 1 ) var detail : texture_2d<f32>;\ntextureSample(detail, detail_sampler, vec2f(0));',
    uniforms: { fragment: [{ type: 'buffer', name: 'NodeBuffer_7', node: {}, groupNode: { name: 'object' } }] },
    getDataFromNode: () => ({ uniformGPU: buffer }),
    bindingsIndexes: { object: { group: 1 } }, getBindings: () => [group],
  };
  assert.equal(pruneUnusedSamplerBindings(builder), 1);
  assert.match(builder.fragmentShader, /@binding\( 1 \) @group\( 1 \)\nvar<uniform> NodeBuffer_7/);
  assert.match(builder.fragmentShader, /@binding\( 2 \) @group\( 1 \) var detail_sampler/);
  assert.match(builder.fragmentShader, /@binding\( 3 \) @group\( 1 \) var detail/);
});
