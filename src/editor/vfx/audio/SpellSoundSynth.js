import * as THREE from 'three';
import { audioBus } from '../../audio/index.js';
import { SPELL_SOUNDS } from './spellSoundBank.js';

const REFERENCE_DISTANCE_M = 10;
const MAX_DISTANCE_M = 160;
const SPEED_OF_SOUND_MPS = 343;

/**
 * Plays procedural spell cues through the game's audio bus, so the master
 * volume and mute apply. Sounds are panned against the camera and delayed
 * by distance — a far explosion is seen before it is heard.
 */
export function createSpellSoundSynth({ bus = audioBus } = {}) {
  const listener = new THREE.Vector3();
  const right = new THREE.Vector3(1, 0, 0);
  const offset = new THREE.Vector3();

  const output = () => {
    const synth = bus.synthManager;
    if (!synth) return null;
    if (!synth.isInitialized?.()) bus.init?.();
    if (!synth.isEnabled?.() || !synth.ctx || !synth.master) return null;
    synth.resumeContext?.();
    return synth;
  };

  return {
    setListener(camera) {
      camera.getWorldPosition(listener);
      right.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    },
    play(name, origin, options = {}) {
      const cue = SPELL_SOUNDS[name];
      const synth = cue ? output() : null;
      if (!synth) return false;
      const { ctx, master } = synth;
      let distance = 0;
      let pan = 0;
      if (origin) {
        offset.set(origin.x - listener.x, origin.y - listener.y, origin.z - listener.z);
        distance = offset.length();
        if (distance > MAX_DISTANCE_M) return false;
        if (distance > 1e-3) pan = offset.dot(right) / distance;
      }
      const worldVolume = bus.config?.global?.world_volume ?? 1;
      const gain = ctx.createGain();
      gain.gain.value = worldVolume * Math.min(1, REFERENCE_DISTANCE_M / Math.max(REFERENCE_DISTANCE_M, distance)) * 0.6;
      let node = gain;
      if (typeof ctx.createStereoPanner === 'function') {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-0.85, Math.min(0.85, pan * 0.8));
        gain.connect(panner);
        node = panner;
      }
      // Distance muffles the top end.
      const muffle = ctx.createBiquadFilter();
      muffle.type = 'lowpass';
      muffle.frequency.value = 18000 / (1 + distance / 25);
      node.connect(muffle).connect(master);
      const when = ctx.currentTime + 0.01 + distance / SPEED_OF_SOUND_MPS;
      try {
        cue(ctx, gain, when, options);
      } catch (error) {
        console.warn(`[vfx] Spell sound "${name}" failed.`, error);
        return false;
      }
      return true;
    },
  };
}
