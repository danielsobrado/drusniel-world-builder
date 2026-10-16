import { frameGroup } from 'three/tsl';
import { frameUniform as uniform } from '../../../render/FrameUniforms.js';

const TIME_BY_CONFIG = new WeakMap();

export function registerTreeWindTime(config, time) {
  if (config && time) TIME_BY_CONFIG.set(config, time.setGroup(frameGroup));
}

export function treeWindTimeFor(config) {
  return TIME_BY_CONFIG.get(config) ?? uniform(0);
}
