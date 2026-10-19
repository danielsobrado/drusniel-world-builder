import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';
import { resolveBiomeLooks } from '../../src/editor/biomes/BiomeLooks.js';

/** The shipped biome look table (config/biome-looks.yaml), resolved. */
export function loadBiomeLooks() {
  const source = yaml.load(readFileSync(new URL('../../config/biome-looks.yaml', import.meta.url), 'utf8'));
  return resolveBiomeLooks(source.biomeLooks);
}
