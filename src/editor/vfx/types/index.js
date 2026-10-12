import { createParticleTypeRegistry } from '../particles/ParticleTypeRegistry.js';
import { ELEMENTAL_TYPES } from './elementalTypes.js';
import { EXPLOSION_TYPES } from './explosionTypes.js';
import { MAGIC_TYPES } from './magicTypes.js';

/** The registry of every ParticleType the spell recipes use. */
export function createSpellParticleTypes() {
  const registry = createParticleTypeRegistry();
  registry.registerAll(EXPLOSION_TYPES);
  registry.registerAll(ELEMENTAL_TYPES);
  registry.registerAll(MAGIC_TYPES);
  registry.validateReferences();
  return registry;
}
