/** A lost startup device must reject boot even if a driver compile never settles. */
export class RendererStartupGuard {
  constructor() {
    this.error = null;
    this.failure = new Promise((_, reject) => { this.reject = reject; });
    // Loss may arrive between awaited stages. The next wait still observes it.
    this.failure.catch(() => {});
    this.onLoss = info => {
      if (this.error) return;
      this.error = new Error(`Renderer device lost during startup: ${info?.message ?? info?.reason ?? 'unknown reason'}`);
      this.reject(this.error);
    };
  }

  attach(renderer) {
    this.renderer = renderer;
    this.previousHandler = renderer.onDeviceLost;
    renderer.onDeviceLost = this.onLoss;
  }

  throwIfLost() { if (this.error) throw this.error; }

  async wait(operation) {
    // Attach a rejection handler even when loss has already arrived.
    const task = Promise.resolve(operation);
    const value = await Promise.race([task, this.failure]);
    this.throwIfLost();
    return value;
  }

  dispose() {
    if (this.renderer?.onDeviceLost === this.onLoss) {
      this.renderer.onDeviceLost = this.previousHandler;
    }
    this.renderer = null;
  }
}
