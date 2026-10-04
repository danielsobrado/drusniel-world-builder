import { createSeaDetailTexture } from './seaDetail.js';

const entries = new Map();

/** Share one packed slope/height/moment map across resident water materials. */
export function acquireSeaDetailTexture(choppiness = 4) {
  if (!Number.isFinite(choppiness) || choppiness < 0) {
    throw new Error('Sea detail choppiness must be finite and non-negative.');
  }
  let entry = entries.get(choppiness);
  if (!entry) {
    const texture = createSeaDetailTexture(choppiness);
    texture.name = 'Gods End sea detail';
    entry = { texture, refs: 0 };
    entries.set(choppiness, entry);
  }
  entry.refs += 1;
  let released = false;
  return {
    texture: entry.texture,
    release() {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs === 0) {
        entries.delete(choppiness);
        entry.texture.dispose();
      }
    },
  };
}
