export class FloatingOrigin {
  constructor({ threshold, snapSize }) {
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new Error('Floating-origin threshold must be positive.');
    }
    if (!Number.isFinite(snapSize) || snapSize <= 0) {
      throw new Error('Floating-origin snap size must be positive.');
    }
    this.threshold = threshold;
    this.snapSize = snapSize;
    this.originX = 0;
    this.originZ = 0;
    this.listeners = new Set();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notify(event) {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Floating-origin listener failed.', error);
      }
    }
  }

  writeCanonical(renderX, renderZ, target) {
    target.x = renderX + this.originX;
    target.z = renderZ + this.originZ;
    return target;
  }

  toCanonical(renderX, renderZ) {
    return Object.freeze(this.writeCanonical(renderX, renderZ, {}));
  }

  writeRender(worldX, worldZ, target) {
    target.x = worldX - this.originX;
    target.z = worldZ - this.originZ;
    return target;
  }

  toRender(worldX, worldZ) {
    return Object.freeze(this.writeRender(worldX, worldZ, {}));
  }

  update(renderFocus) {
    if (Math.abs(renderFocus.x) < this.threshold && Math.abs(renderFocus.z) < this.threshold) {
      return null;
    }
    const shiftX = Math.trunc(renderFocus.x / this.snapSize) * this.snapSize;
    const shiftZ = Math.trunc(renderFocus.z / this.snapSize) * this.snapSize;
    if (shiftX === 0 && shiftZ === 0) {
      return null;
    }
    this.originX += shiftX;
    this.originZ += shiftZ;
    const event = Object.freeze({
      shiftX,
      shiftZ,
      originX: this.originX,
      originZ: this.originZ,
    });
    this.notify(event);
    return event;
  }

  setOrigin(originX, originZ) {
    if (!Number.isFinite(originX) || !Number.isFinite(originZ)) {
      throw new Error('Floating-origin coordinates must be finite.');
    }
    const shiftX = originX - this.originX;
    const shiftZ = originZ - this.originZ;
    this.originX = originX;
    this.originZ = originZ;
    return Object.freeze({ shiftX, shiftZ, originX, originZ });
  }

  readState(target) {
    target.x = this.originX;
    target.z = this.originZ;
    return target;
  }

  getState() {
    return Object.freeze(this.readState({}));
  }
}
