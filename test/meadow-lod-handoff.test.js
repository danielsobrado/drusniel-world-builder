import assert from 'node:assert/strict';
import test from 'node:test';
import { float, vec2, vec3 } from 'three/tsl';
import { applyHandoff, applyPublicationFade } from '../src/editor/stylized/meadow/meadowFade.js';

// Evaluate the actual mask graph at a fixed distance and screen-noise value.
// This reaches applyHandoff's material assignment, not a parallel CPU formula.
function evaluate(node, distance, noise) {
  if (node.isVarNode || node.isConvertNode) return evaluate(node.node, distance, noise);
  if (node.isConstNode || node.isUniformNode) return node.value;
  if (node.condNode && node.ifNode) return evaluate(evaluate(node.condNode, distance, noise)
    ? node.ifNode : node.elseNode, distance, noise);
  if (node.isSplitNode) return evaluate(node.node, distance, noise)[node.components];
  if (node.isShaderCallNodeInternal) return noise;
  if (node.isMathNode) {
    if (node.method === 'length') return distance;
    const a = evaluate(node.aNode, distance, noise);
    if (node.method === 'oneMinus') return 1 - a;
    if (node.method === 'smoothstep') {
      const b = evaluate(node.bNode, distance, noise);
      const c = evaluate(node.cNode, distance, noise);
      const t = Math.max(0, Math.min(1, (c - a) / (b - a)));
      return t * t * (3 - 2 * t);
    }
  }
  if (node.isOperatorNode) {
    const a = evaluate(node.aNode, distance, noise);
    const b = evaluate(node.bNode, distance, noise);
    switch (node.op) {
      case '*': return a * b;
      case '-': return a - b;
      case '<': return a < b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '&&': return a && b;
    }
  }
  throw new Error(`Unsupported mask node: ${node.constructor.name}:${node.method ?? node.op}`);
}

function mask(fadeIn, fadeOut) {
  const material = {};
  applyHandoff(material, { base: vec3(0), fadeIn, fadeOut });
  return material.maskNode;
}

test('blade and card handoff masks partition every pixel without gaps or double coverage', () => {
  const handoff = vec2(40, 50);
  const blades = mask(null, handoff);
  const cards = mask(handoff, vec2(162, 180));
  for (const distance of [39, 40, 41, 43, 45, 47, 49, 50, 51]) {
    for (let sample = 0; sample < 100; sample += 1) {
      const noise = sample / 100;
      assert.notEqual(evaluate(blades, distance, noise), evaluate(cards, distance, noise),
        `gap or overlap at distance ${distance}, noise ${noise}`);
    }
  }
});

test('far cards fade away completely and a lone blade layer keeps its ordinary dissolve', () => {
  const cards = mask(vec2(40, 50), vec2(162, 180));
  const blades = mask(null, vec2(40, 50));
  for (let sample = 0; sample < 100; sample += 1) {
    const noise = sample / 100;
    assert.equal(evaluate(cards, 39, noise), false);
    assert.equal(evaluate(cards, 100, noise), true);
    assert.equal(evaluate(cards, 180, noise), false);
    assert.equal(evaluate(blades, 39, noise), true);
    assert.equal(evaluate(blades, 50, noise), false);
  }
});

test('arriving grass fades in while retained ranks stay visible and distance handoff still applies', () => {
  const publicationMask = (rank, time, distanceFade = false) => {
    const material = {};
    if (distanceFade) applyHandoff(material, { base: vec3(0), fadeIn: null, fadeOut: vec2(40, 50) });
    applyPublicationFade(material, { instance: { rank: float(rank), revealRank: float(100), revealTime: float(10) }, time: float(time) });
    return material.maskNode;
  };
  for (let sample = 0; sample < 100; sample++) {
    const noise = sample / 100;
    assert.equal(evaluate(publicationMask(99, 10), 0, noise), true, 'retained stems do not disappear');
    assert.equal(evaluate(publicationMask(100, 10), 0, noise), false, 'new stems start hidden');
    assert.equal(evaluate(publicationMask(100, 10.36), 0, noise), true, 'arrival completes');
    assert.equal(evaluate(publicationMask(100, 10.36, true), 50, noise), false, 'arrival cannot bypass distance fade');
  }
  const halfway = publicationMask(100, 10.175);
  const kept = Array.from({ length: 100 }, (_, i) => evaluate(halfway, 0, i / 100)).filter(Boolean).length;
  assert.ok(kept >= 49 && kept <= 51, 'half the pixels reveal halfway through arrival');
});
