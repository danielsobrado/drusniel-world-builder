import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_CONTACT_SHADE,
  contactShadeRadius,
  paintContactShade,
  resolveContactShade,
} from '../src/editor/stylized/contactShade.js';
import { collectChunkContactShadeSources } from '../src/editor/stylized/groundContact/contactShadeSources.js';
import { ROOT_LOBE, footprintLobe, footprintPhase } from '../src/editor/stylized/groundContact/ecologicalFootprint.js';
import { contactGrassSuppression } from '../src/editor/stylized/groundContact/GroundContactField.js';

// A 128 m texture at 1 m texels centred on the origin; texel (x, z) centre is at
// world (x - 63.5, 63.5 - z).
const SIZE = 128;
const texelAt = (worldX, worldZ) => [Math.round(worldX + 63.5), Math.round(63.5 - worldZ)];
function paint(sources, extra = {}, pixels = new Uint8Array(SIZE * SIZE * 4)) {
  paintContactShade({ pixels, size: SIZE, centerWorldX: 0, centerWorldZ: 0, chunkWorldSize: SIZE, sources, ...extra });
  return pixels;
}
const read = (pixels, worldX, worldZ, channel = 1) => {
  const [x, z] = texelAt(worldX, worldZ);
  return pixels[(z * SIZE + x) * 4 + channel];
};

test('PR 6 a phased trunk patch is lobed, not a ruled disc (DEF-09)', () => {
  const tree = { x: 0.5, z: -0.5, radius: 6, strength: 1, phase: 0.9 };
  const pixels = paint([tree]);
  // The extent toward the widest and narrowest lobe differs by ±ROOT_LOBE.
  const wide = -tree.phase / 3;
  const narrow = wide + Math.PI / 3;
  const at = angle => read(pixels, tree.x + 4 * Math.cos(angle), tree.z + 4 * Math.sin(angle));
  assert.ok(at(wide) > at(narrow) + 20, `wide ${at(wide)} narrow ${at(narrow)}`);
  // A source without a phase keeps the old radial patch.
  const disc = paint([{ ...tree, phase: undefined }]);
  const discAt = angle => read(disc, tree.x + 4 * Math.cos(angle), tree.z + 4 * Math.sin(angle));
  assert.ok(Math.abs(discAt(wide) - discAt(narrow)) <= 12); // 1 m texel snapping only
  // The wide lobe reaches past the plain radius, so the paint bound must include it.
  const past = tree.radius * 1.1;
  assert.ok(read(pixels, tree.x + past * Math.cos(wide), tree.z + past * Math.sin(wide)) > 0);
  assert.equal(read(pixels, tree.x + past * Math.cos(narrow), tree.z + past * Math.sin(narrow)), 0);
});

test('PR 6 the shade outline is the meadow root-zone outline (same phase, same lobe)', () => {
  const placement = { x: 13.25, z: -7.5, heightScale: 1 };
  const settings = resolveContactShade({});
  const { sources, rootLitterSources } = collectChunkContactShadeSources({
    descriptor: { chunkX: 0, chunkZ: 0, centerWorldX: 0, centerWorldZ: 0 },
    chunkWorldSize: SIZE,
    settings,
    treeView: { manifestStore: { get: () => [placement], peek: () => [] } },
  });
  assert.equal(sources.length, 1);
  assert.equal(sources[0].phase, footprintPhase(placement.x, placement.z));
  // Equal lobed distance ⇒ equal paint, in any direction: the iso-lines are the lobe.
  const pixels = paint(sources);
  const { radius, phase } = sources[0];
  const values = [];
  for (let i = 0; i < 12; i += 1) {
    const angle = (i / 12) * Math.PI * 2;
    const r = 0.5 * radius * footprintLobe(Math.cos(angle), Math.sin(angle), phase);
    values.push(read(pixels, placement.x + r * Math.cos(angle), placement.z + r * Math.sin(angle)));
  }
  const expected = Math.round(0.25 * 255);
  for (const v of values) assert.ok(Math.abs(v - expected) < 40, `lobed iso-value ${v} vs ${expected}`);
  // Multi-radius: the root litter footprint shares the phase at its own radius.
  assert.equal(rootLitterSources.length, 1);
  assert.equal(rootLitterSources[0].phase, phase);
  assert.equal(rootLitterSources[0].radius, contactShadeRadius(settings, 'tree', 1) * settings.rootLitterRadiusShare);
});

test('PR 6 root litter is weighted by the canopy over it', () => {
  const settings = resolveContactShade({});
  const source = { x: 0.5, z: -0.5, radius: 4, strength: settings.rootLitterStrength, phase: 0 };
  const litter = canopy => {
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let i = 0; i < SIZE * SIZE; i += 1) pixels[i * 4] = canopy;
    paint([source], { channel: 2, weightChannel: 0, weightFloor: settings.rootLitterOpenShare }, pixels);
    return read(pixels, source.x, source.z, 2);
  };
  const forest = litter(255);
  const meadow = litter(0);
  assert.ok(Math.abs(forest - Math.round(settings.rootLitterStrength * 255)) <= 1);
  assert.ok(Math.abs(meadow / forest - settings.rootLitterOpenShare) < 0.02, `${meadow}/${forest}`);
  // Painting keeps the larger of the existing litter and the root litter.
  const pixels = new Uint8Array(SIZE * SIZE * 4).fill(250);
  paint([source], { channel: 2, weightChannel: 0, weightFloor: 0.3 }, pixels);
  assert.equal(read(pixels, source.x, source.z, 2), 250);
});

test('PR 6 contact clears published vegetation coverage smoothly, and settings validate', () => {
  assert.equal(contactGrassSuppression(0), 0);
  assert.equal(contactGrassSuppression(0.12), 0);
  assert.equal(contactGrassSuppression(0.62), 1);
  assert.equal(contactGrassSuppression(1), 1);
  let previous = 0;
  for (let c = 0; c <= 1; c += 0.05) {
    const value = contactGrassSuppression(c);
    assert.ok(value >= previous - 1e-12);
    previous = value;
  }
  assert.equal(DEFAULT_CONTACT_SHADE.rootLitterOpenShare, 0.3);
  assert.throws(() => resolveContactShade({ contactShade: { rootLitterOpenShare: 1.5 } }), /rootLitterOpenShare/);
  assert.equal(resolveContactShade({ contactShade: { enabled: false } }), null);
});
