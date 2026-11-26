/** Shared pressure state; consumers may reduce distant rendering detail only. */
export function regionalLodThresholds(thresholds, factor) {
  if (!Number.isFinite(factor) || factor <= 0 || factor >= 1) return thresholds;
  return {
    ...thresholds,
    nearPixels: thresholds.nearPixels / factor,
    proxyPixels: thresholds.proxyPixels / factor,
    impostorPixels: thresholds.clusterPixels > 0
      ? thresholds.impostorPixels / factor
      : thresholds.impostorPixels,
  };
}

/** Protect the streaming focus and the camera's actual chunk after rebasing. */
export function regionalLodProtected(chunkX, chunkZ, focus, camera, origin, chunkSize, radius) {
  if (Math.max(Math.abs(chunkX - focus.chunkX), Math.abs(chunkZ - focus.chunkZ)) <= radius) return true;
  const cameraChunkX = Math.floor((camera.position.x + origin.x) / chunkSize);
  const cameraChunkZ = Math.floor(-(camera.position.z + origin.z) / chunkSize);
  return Math.max(Math.abs(chunkX - cameraChunkX), Math.abs(chunkZ - cameraChunkZ)) <= radius;
}
export class RegionalDensityBudget {
  constructor(settings) {
    this.settings = settings;
    this.pressured = false;
    this.nextSample = 0;
  }

  update(now, { triangles = 0, draws = 0, townInstances = 0, vegetationInstances = 0 } = {}) {
    if (now >= this.nextSample) {
      this.nextSample = now + this.settings.sampleIntervalMs;
      const workload = Math.max(triangles / this.settings.triangleBudget, draws / this.settings.drawBudget,
        townInstances > 0 && vegetationInstances > 0 ? townInstances / this.settings.townInstanceBudget : 0);
      this.pressured = this.pressured ? workload > this.settings.recoveryRatio : workload > 1;
    }
    return this.pressured ? this.settings.farGrassPressure : 1;
  }

  get sceneryFactor() {
    return this.pressured ? (this.settings.sceneryLodPressure ?? 1) : 1;
  }
}
