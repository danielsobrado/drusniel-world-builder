/**
 * The sound of a town: a murmur of voices that swells toward the market, and
 * the ring of a hammer when a smithy is near.
 *
 * Synthesised, like the rest of the procedural audio: there is no recording of
 * a crowd in the sample bank. The murmur is noise shaped into the band speech
 * lives in and stirred by slow, unsynchronised swells, so it rises and falls
 * the way a crowd does without ever saying anything.
 */

/** How present a town is to a listener `distance` metres from its centre: 1 in its streets, 0 well outside. */
export function settlementPresence(distance, radius) {
  if (!(radius > 0)) return 0;
  const t = Math.max(0, Math.min(1, (radius * 1.25 - distance) / (radius * 0.7)));
  return t * t * (3 - 2 * t);
}

/** Loudness of the murmur for a town of this rank, 0–1: a hamlet is a few voices, a city a hum. */
export function murmurLevel(rank, night) {
  return (0.25 + Math.min(4, rank) * 0.19) * (night ? 0.25 : 1);
}

const MURMUR_GAIN = 0.05;
const ANVIL_REACH = 70;
/** The bands of the voice, each swelling on its own slow clock: `[hertz, swells per second, depth]`. */
const VOICE_BANDS = Object.freeze([[340, 0.21, 0.5], [780, 0.33, 0.6], [1500, 0.47, 0.7]]);
/** A hammer on iron: inharmonic partials as `[hertz, level, seconds to die away]`. */
const ANVIL_PARTIALS = Object.freeze([[2140, 0.5, 0.22], [3460, 0.32, 0.14], [880, 0.2, 0.08]]);

export class SettlementAmbience {
  /** @param {{ synthManager: { ctx: ?AudioContext, master: ?AudioNode, isEnabled: () => boolean } }} audioBus */
  constructor(audioBus) {
    this.audioBus = audioBus;
    this.context = null;
    this.murmur = null;
    this.nextStrike = 0;
    this.strikesLeft = 0;
  }

  /** Builds the murmur on first use, once the audio context exists. */
  ensure() {
    const context = this.audioBus.synthManager.ctx;
    if (!context) return false;
    if (this.context === context) return true;
    this.dispose();
    this.context = context;
    const seconds = 4;
    const buffer = context.createBuffer(1, context.sampleRate * seconds, context.sampleRate);
    const samples = buffer.getChannelData(0);
    let last = 0;
    for (let index = 0; index < samples.length; index += 1) {
      // Brown noise: each sample a small step from the last.
      last = (last + (Math.random() * 2 - 1) * 0.05) / 1.02;
      samples[index] = last * 3.2;
    }
    const output = context.createGain();
    output.gain.value = 0;
    output.connect(this.audioBus.synthManager.master);
    const sources = [];
    for (const [frequency, rate, depth] of VOICE_BANDS) {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.playbackRate.value = 0.85 + rate;
      const band = context.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = frequency;
      band.Q.value = 1.1;
      const swell = context.createGain();
      swell.gain.value = 1 - depth / 2;
      const clock = context.createOscillator();
      clock.frequency.value = rate;
      const amount = context.createGain();
      amount.gain.value = depth / 2;
      clock.connect(amount).connect(swell.gain);
      source.connect(band).connect(swell).connect(output);
      source.start(0, Math.random() * seconds);
      clock.start();
      sources.push(source, clock);
    }
    this.murmur = { output, sources };
    return true;
  }

  /** One hammer blow, struck and left to ring. */
  strike(level) {
    const now = this.context.currentTime;
    for (const [frequency, gain, decay] of ANVIL_PARTIALS) {
      const tone = this.context.createOscillator();
      tone.type = 'sine';
      tone.frequency.value = frequency * (0.985 + Math.random() * 0.03);
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(gain * level, now);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + decay);
      tone.connect(envelope).connect(this.audioBus.synthManager.master);
      tone.start(now);
      tone.stop(now + decay + 0.02);
    }
  }

  /**
   * @param {number} seconds frame time
   * @param {?{ distance: number, radius: number, rank: number, smithy: number }} town the nearest town:
   *   metres to its centre, its radius and rank, and metres to its nearest smithy (Infinity if none)
   * @param {boolean} night
   */
  update(seconds, town, night) {
    if (!this.audioBus.synthManager.isEnabled() || !this.ensure()) return;
    const presence = town ? settlementPresence(town.distance, town.radius) : 0;
    const level = presence * (town ? murmurLevel(town.rank, night) : 0) * MURMUR_GAIN;
    // Ease toward the level, so walking in and out of a town is never a click.
    this.murmur.output.gain.setTargetAtTime(level, this.context.currentTime, 0.6);
    if (!town || night || !(town.smithy < ANVIL_REACH) || seconds < this.nextStrike) return;
    this.strike(0.035 * (1 - town.smithy / ANVIL_REACH) ** 2);
    // A smith works in runs: a few blows close together, then a pause to turn the iron.
    if (this.strikesLeft > 0) {
      this.strikesLeft -= 1;
      this.nextStrike = seconds + 0.42 + Math.random() * 0.12;
    } else {
      this.strikesLeft = 2 + Math.floor(Math.random() * 4);
      this.nextStrike = seconds + 2.5 + Math.random() * 5;
    }
  }

  dispose() {
    if (!this.murmur) return;
    for (const source of this.murmur.sources) source.stop();
    this.murmur.output.disconnect();
    this.murmur = null;
    this.context = null;
  }
}
