import { ShuffleBag } from './audio_variations.js';

/** Express a canonical emitter in the default WebAudio listener's local frame. */
export function listenerRelative(listener, point) {
  const dx = point.x - listener.x, dz = point.z - listener.z;
  const c = Math.cos(listener.yaw), s = Math.sin(listener.yaw);
  return { x: dx * c - dz * s, y: (point.y ?? 0) - (listener.y ?? 0), z: dx * s + dz * c };
}

/** Gods' End's positioned calls, adapted to Azgaar water samples and the existing bus. */
export class AmbientOneShots {
  constructor({ bank, definitions, random = Math.random }) {
    this.bank = bank; this.definitions = definitions; this.random = random;
    this.timers = new Map(); this.bags = new Map(); this.active = new Set();
  }

  nextInterval(kind) { return kind.interval[0] + this.random() * (kind.interval[1] - kind.interval[0]); }

  update(weights, dt, listener, destination, seaPoints = [], enabled = true) {
    for (const entry of this.active) {
      entry.voice.setVolume(enabled ? entry.volume * (weights[entry.name] ?? 0) : 0);
      entry.voice.setPosition(listenerRelative(listener, entry.point));
    }
    if (!enabled) return;
    for (const [name, kind] of Object.entries(this.definitions)) {
      const weight = weights[name] ?? 0;
      if (weight <= 0.02) { this.timers.delete(name); continue; }
      if (!this.timers.has(name)) for (const path of kind.samples) this.bank.load(path);
      const left = (this.timers.get(name) ?? this.nextInterval(kind)) - dt * (0.4 + weight * 0.6);
      if (left > 0) { this.timers.set(name, left); continue; }
      this.timers.set(name, this.nextInterval(kind));
      if ([...this.active].filter(entry => entry.name === name).length >= 2) continue;
      let point;
      if (kind.bearing === 'sea') {
        // Positions come from actual ocean queries, never an assumed coast direction.
        if (!seaPoints.length) continue;
        point = seaPoints[Math.floor(this.random() * seaPoints.length)];
      } else {
        const angle = this.random() * Math.PI * 2, distance = 18 + this.random() * 32;
        point = { x: listener.x + Math.cos(angle) * distance,
          z: listener.z + Math.sin(angle) * distance, y: (listener.y ?? 0) + 2 };
      }
      let bag = this.bags.get(name);
      if (!bag) { bag = new ShuffleBag(kind.samples, this.random); this.bags.set(name, bag); }
      const entry = { name, point, volume: kind.volume * (0.6 + this.random() * 0.4) };
      const voice = this.bank.playVoice(bag.next(), {
        volume: entry.volume * weight, rate: 0.94 + this.random() * 0.12,
        position: listenerRelative(listener, point), destination,
        refDistance: kind.bearing === 'sea' ? 50 : 15,
        onEnded: () => this.active.delete(entry),
      });
      if (voice) { entry.voice = voice; this.active.add(entry); }
    }
  }

  dispose() {
    for (const entry of this.active) entry.voice.stop();
    this.active.clear(); this.timers.clear(); this.bags.clear();
  }
}
