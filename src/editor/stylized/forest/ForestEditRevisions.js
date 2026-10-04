/** Local manifest dependencies for authored edits; the edit document stays canonical. */
export class ForestEditRevisions {
  constructor(chunkWorldSize) {
    this.size = chunkWorldSize;
    this.epoch = 0;
    this.clock = 0;
    this.chunks = new Map();
  }

  reset() { this.epoch++; this.chunks.clear(); }

  touch(x, z) {
    this.chunks.set(`${x}:${z}`, ++this.clock);
  }

  touchPosition(x, z) {
    this.touch(Math.floor(x / this.size), Math.floor(-z / this.size));
  }

  signature(x, z) {
    const parts = [this.epoch];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      parts.push(this.chunks.get(`${x + dx}:${z + dz}`) ?? 0);
    }
    return parts.join(':');
  }

  fell(stableId, planted) {
    const match = /^tree:(-?\d+):(-?\d+):\d+$/.exec(stableId);
    if (match) this.touch(Number(match[1]), Number(match[2]));
    else if (planted) this.touchPosition(planted.x, planted.z);
    else this.reset();
  }

  patch(patchId, forest) {
    const [, size, x, z] = patchId.split(':').map(Number);
    if (!forest || ![size, x, z].every(Number.isFinite) || size <= 0) {
      this.reset();
      return;
    }
    // A patch can be selected only inside ForestPatchField's search window.
    // Include its warp and interpolation stencil, even where coverage is zero.
    const maximumAxis = Math.max(...[...forest.profiles.values()].map(profile =>
      profile.patchRadiusMax * Math.max(1, profile.patchAspectMax)
        * (1 + profile.boundaryWarp * 0.5)));
    const reach = (Math.max(2, Math.floor(maximumAxis + 0.85)) + 1) * size
      + forest.patchSampleSpacing;
    const centerX = (x + 0.5) * size;
    const centerZ = (z + 0.5) * size;
    for (let cz = Math.floor(-(centerZ + reach) / this.size);
      cz <= Math.floor(-(centerZ - reach) / this.size); cz++) {
      for (let cx = Math.floor((centerX - reach) / this.size);
        cx <= Math.floor((centerX + reach) / this.size); cx++) this.touch(cx, cz);
    }
  }
}
