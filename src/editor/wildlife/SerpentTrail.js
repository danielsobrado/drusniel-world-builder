/** The head's path: points TRAIL_STEP apart, newest last, plus the head itself. */
export class SerpentTrail {
  constructor(length, step = 0.05) {
    this.step = step;
    this.capacity = Math.ceil(length / step) + 4;
    this.x = new Float32Array(this.capacity);
    this.z = new Float32Array(this.capacity);
    this.reset(0, 0);
  }

  reset(x, z) {
    this.count = 1;
    this.x[0] = x;
    this.z[0] = z;
    this.headX = x;
    this.headZ = z;
    // Distance from the newest point to the head.
    this.travel = 0;
  }

  #push(x, z) {
    const index = this.count % this.capacity;
    this.x[index] = x;
    this.z[index] = z;
    this.count += 1;
  }

  advance(x, z) {
    let fromX = this.headX, fromZ = this.headZ;
    let distance = Math.hypot(x - fromX, z - fromZ);
    while (distance > 0 && this.travel + distance >= this.step) {
      const t = (this.step - this.travel) / distance;
      fromX += (x - fromX) * t;
      fromZ += (z - fromZ) * t;
      this.#push(fromX, fromZ);
      distance = Math.hypot(x - fromX, z - fromZ);
      this.travel = 0;
    }
    this.travel += distance;
    this.headX = x;
    this.headZ = z;
  }

  /** Point `s` metres back along the path from the head. */
  sample(s, out) {
    const newest = (this.count - 1) % this.capacity;
    if (s <= this.travel) {
      const t = this.travel > 0 ? s / this.travel : 0;
      out.x = this.headX + (this.x[newest] - this.headX) * t;
      out.z = this.headZ + (this.z[newest] - this.headZ) * t;
      return out;
    }
    const back = (s - this.travel) / this.step;
    const oldestBack = Math.min(this.count, this.capacity) - 1;
    const whole = Math.min(Math.floor(back), oldestBack);
    const fraction = whole === oldestBack ? 0 : back - whole;
    const a = (this.count - 1 - whole) % this.capacity;
    const b = whole === oldestBack ? a : (this.count - 2 - whole) % this.capacity;
    out.x = this.x[a] + (this.x[b] - this.x[a]) * fraction;
    out.z = this.z[a] + (this.z[b] - this.z[a]) * fraction;
    return out;
  }
}
