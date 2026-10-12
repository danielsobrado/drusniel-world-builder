/**
 * Web Audio building blocks for procedural spell sounds. Each layer
 * schedules itself on `ctx` into `output` at `when` and stops itself.
 */

let sharedNoise = null;

function noiseBuffer(ctx) {
  if (sharedNoise && sharedNoise.sampleRate === ctx.sampleRate) return sharedNoise;
  const length = ctx.sampleRate * 2;
  sharedNoise = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = sharedNoise.getChannelData(0);
  // Pink-ish noise: white noise through a cheap one-pole, rumble keeps body.
  let last = 0;
  for (let index = 0; index < length; index += 1) {
    const white = Math.random() * 2 - 1;
    last = 0.97 * last + 0.03 * white;
    data[index] = white * 0.55 + last * 3.5;
  }
  return sharedNoise;
}

function envelope(ctx, gainNode, when, peak, attack, hold, decay) {
  const gain = gainNode.gain;
  gain.setValueAtTime(0.0001, when);
  gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), when + Math.max(0.002, attack));
  gain.setValueAtTime(Math.max(0.0002, peak), when + attack + hold);
  gain.exponentialRampToValueAtTime(0.0001, when + attack + hold + Math.max(0.01, decay));
  return when + attack + hold + decay + 0.05;
}

/**
 * Filtered noise burst: booms, whooshes, hiss, crackle beds.
 * @param {object} spec { gain, attack, hold, decay, filter, freq, freqEnd, q, rate }
 */
export function noise(ctx, output, when, spec) {
  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer(ctx);
  source.loop = true;
  source.playbackRate.value = spec.rate ?? 1;
  const filter = ctx.createBiquadFilter();
  filter.type = spec.filter ?? 'lowpass';
  filter.Q.value = spec.q ?? 0.7;
  filter.frequency.setValueAtTime(spec.freq ?? 800, when);
  const end = when + (spec.attack ?? 0.01) + (spec.hold ?? 0) + (spec.decay ?? 0.5);
  if (spec.freqEnd) filter.frequency.exponentialRampToValueAtTime(spec.freqEnd, end);
  const gain = ctx.createGain();
  const stop = envelope(ctx, gain, when, spec.gain ?? 0.5, spec.attack ?? 0.01, spec.hold ?? 0, spec.decay ?? 0.5);
  if (spec.tremolo) {
    const lfo = ctx.createOscillator();
    const depth = ctx.createGain();
    lfo.frequency.value = spec.tremolo;
    depth.gain.value = (spec.gain ?? 0.5) * 0.45;
    lfo.connect(depth).connect(gain.gain);
    lfo.start(when);
    lfo.stop(stop);
  }
  source.connect(filter).connect(gain).connect(output);
  source.start(when, Math.random() * 1.5);
  source.stop(stop);
}

/** Pitched oscillator with a glide: drops, zaps, chimes, drones. */
export function tone(ctx, output, when, spec) {
  const oscillator = ctx.createOscillator();
  oscillator.type = spec.type ?? 'sine';
  oscillator.frequency.setValueAtTime(spec.freq, when);
  const end = when + (spec.attack ?? 0.01) + (spec.hold ?? 0) + (spec.decay ?? 0.4);
  if (spec.freqEnd) oscillator.frequency.exponentialRampToValueAtTime(spec.freqEnd, end);
  if (spec.detune) oscillator.detune.value = spec.detune;
  const gain = ctx.createGain();
  const stop = envelope(ctx, gain, when, spec.gain ?? 0.3, spec.attack ?? 0.01, spec.hold ?? 0, spec.decay ?? 0.4);
  let node = oscillator;
  if (spec.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = spec.lowpass;
    node = node.connect(filter);
  }
  node.connect(gain).connect(output);
  oscillator.start(when);
  oscillator.stop(stop);
}

/**
 * Many tiny clicks: crackling fire, hail, ice, sizzle. Rendered into one
 * buffer and played through one band-pass, so a three-second hail costs one
 * voice rather than hundreds.
 */
export function crackle(ctx, output, when, spec) {
  const duration = spec.duration ?? 1;
  const length = Math.max(1, Math.ceil(duration * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  const count = Math.round((spec.density ?? 30) * duration);
  const decaySamples = Math.max(8, (spec.decay ?? 0.03) * ctx.sampleRate);
  for (let click = 0; click < count; click += 1) {
    const start = Math.floor(Math.random() * length);
    const amplitude = 0.3 + Math.random() * 0.7;
    const end = Math.min(length, start + decaySamples * 4);
    for (let index = start; index < end; index += 1) {
      data[index] += (Math.random() * 2 - 1) * amplitude * Math.exp(-(index - start) / decaySamples);
    }
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = spec.freq ?? 3000;
  filter.Q.value = Math.max(0.5, (spec.q ?? 3) * 0.5);
  const gain = ctx.createGain();
  gain.gain.value = (spec.gain ?? 0.2) * 1.6;
  source.connect(filter).connect(gain).connect(output);
  source.start(when);
}

/** Glass and crystal: inharmonic sine partials with fast, staggered decays. */
export function bell(ctx, output, when, spec) {
  const partials = spec.partials ?? [1, 2.76, 5.4, 8.93];
  partials.forEach((ratio, index) => {
    tone(ctx, output, when + (spec.spread ?? 0) * Math.random(), {
      freq: spec.freq * ratio * (1 + (Math.random() - 0.5) * 0.01),
      gain: (spec.gain ?? 0.15) / (index + 1),
      attack: 0.002,
      decay: (spec.decay ?? 1) / (1 + index * 0.6),
    });
  });
}
