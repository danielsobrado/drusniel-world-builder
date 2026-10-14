/** Atomically replace residency, rebase and pose; collision preparation resumes input. */
export class CameraCutCoordinator {
  constructor({ terrainView, playerController, viewModeController, shiftWorld = () => {},
    refreshObjects = () => {}, notifyCut = () => {}, now = () => performance.now(),
    nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve)), timeoutMs = 120000 }) {
    Object.assign(this, { terrainView, playerController, viewModeController, shiftWorld,
      refreshObjects, notifyCut, now, nextFrame, timeoutMs });
    this.generation = 0;
    this.active = false;
    this.disposed = false;
  }

  async cut({ x, z, yaw = 0, pitch = 0, mode = 'player', heightAboveGround = 1.7 }) {
    if (![x, z, yaw, pitch, heightAboveGround].every(Number.isFinite)
        || heightAboveGround <= 0 || !['player', 'fly'].includes(mode)
        || (mode === 'player' && heightAboveGround !== 1.7)) throw new Error('Invalid camera cut pose.');
    if (this.disposed) throw new Error('Camera cut coordinator is disposed.');
    const generation = ++this.generation;
    const startedAt = this.now();
    const player = this.playerController;
    this.active = true;
    player.cutBlocked = true;
    player.resetInput?.();
    try {
      // No await until the new resident descriptors, origin and camera agree.
      this.terrainView.cutToCanonical({ x, z }, startedAt);
      const origin = this.terrainView.floatingOrigin;
      const shift = this.terrainView.updateFloatingOrigin(origin.toRender(x, z));
      if (shift) this.shiftWorld(shift);
      const render = origin.toRender(x, z);
      if (mode === 'fly') {
        const harness = player.harnessActive;
        player.harnessActive = false;
        this.viewModeController.setMode('fly');
        player.harnessActive = harness;
        const camera = this.viewModeController.freeFly.camera;
        camera.position.set(render.x, this.terrainView.getWorldHeight(render.x, render.z) + heightAboveGround, render.z);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        this.viewModeController.freeFly.euler.copy(camera.rotation);
        camera.updateMatrixWorld();
      } else {
        this.viewModeController.setMode('player', { spawn: render });
        player.setPose({ ...render, yaw, pitch });
        this.viewModeController.thirdPersonCamera?.reset();
      }
      this.refreshObjects();
      this.notifyCut();
      while (mode === 'player' && !player.getStatus().collision.ready) {
        if (generation !== this.generation || this.disposed) return { cancelled: true };
        if (this.now() - startedAt >= this.timeoutMs) throw new Error('Camera cut collision preparation timed out.');
        await this.nextFrame();
      }
      return generation === this.generation ? { cancelled: false, generation } : { cancelled: true };
    } finally {
      if (generation === this.generation) {
        this.active = false;
        player.cutBlocked = false;
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.active = false;
    this.playerController.cutBlocked = false;
  }
}
