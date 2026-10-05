/** Native audio voice in listener-relative metres; never stores render-space coordinates. */
export function createAudioVoice(context, buffer, destination, {
  volume = 1, rate = 1, pan = 0, position = null, refDistance = 15, maxDistance = 200, onEnded,
} = {}) {
  const source = context.createBufferSource(); source.buffer = buffer; source.playbackRate.value = rate;
  const gain = context.createGain(); gain.gain.value = volume;
  const spatial = position && typeof context.createPanner === 'function' ? context.createPanner() : null;
  const stereo = !spatial && (position || pan !== 0) && typeof context.createStereoPanner === 'function'
    ? context.createStereoPanner() : null;
  const nodes = [source, gain, spatial ?? stereo].filter(Boolean);
  let ended = false;
  const release = () => {
    if (ended) return;
    ended = true; nodes.forEach(node => node.disconnect()); onEnded?.();
  };
  source.onended = release;
  if (spatial) {
    Object.assign(spatial, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance, maxDistance, rolloffFactor: 1 });
  }
  const voice = {
    setPosition(point) {
      if (spatial?.positionX) {
        spatial.positionX.value = point.x; spatial.positionY.value = point.y; spatial.positionZ.value = point.z;
      } else if (spatial) spatial.setPosition(point.x, point.y, point.z);
      else if (stereo) {
        const distance = Math.hypot(point.x, point.y, point.z);
        stereo.pan.value = distance > 0 ? point.x / distance : 0;
        gain.gain.value = volume / Math.max(1, distance / refDistance);
      }
    },
    stop() { if (!ended) { try { source.stop(); } finally { release(); } } },
    setVolume(value) { volume = value; gain.gain.value = value; },
  };
  source.connect(gain);
  if (spatial || stereo) { gain.connect(spatial ?? stereo); (spatial ?? stereo).connect(destination); }
  else gain.connect(destination);
  if (position) voice.setPosition(position);
  else if (stereo) stereo.pan.value = Math.max(-1, Math.min(1, pan));
  source.start();
  return voice;
}
