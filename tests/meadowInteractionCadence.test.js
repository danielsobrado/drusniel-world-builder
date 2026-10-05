import assert from 'node:assert/strict';
import test from 'node:test';
import { MeadowInteractionMap } from '../src/editor/stylized/meadow/MeadowInteractionMap.js';

test('meadow interaction texture uploads follow the configured cadence', () => {
  const interaction = new MeadowInteractionMap({
    resolution: 32,
    worldSize: 8,
    bodyRadius: 0.5,
    uploadIntervalFrames: 2,
    getHeight: () => 0,
  });
  try {
    const initialVersion = interaction.texture.version;
    const body = { x: 0, y: 0, z: 0 };
    interaction.update(body);
    assert.equal(interaction.texture.version, initialVersion);
    interaction.update(body);
    assert.equal(interaction.texture.version, initialVersion + 1);
  } finally {
    interaction.dispose();
  }
});
