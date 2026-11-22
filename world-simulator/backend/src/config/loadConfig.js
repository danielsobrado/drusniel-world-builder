import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

export const SIMULATOR_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function readYaml(file) {
  try {
    return yaml.load(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read configuration ${path.basename(file)}: ${error.message}`, { cause: error });
  }
}

function port(value, name) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error(`${name} must be a TCP port, got ${value}`);
  return n;
}

function validateClassification(classes) {
  if (!Array.isArray(classes) || classes.length === 0) throw new Error('classification must be a non-empty list');
  let previous = 0;
  classes.forEach((entry, index) => {
    const last = index === classes.length - 1;
    if (typeof entry?.id !== 'string') throw new Error(`classification[${index}] needs an id`);
    if (last ? entry.maxPopulation != null : !(entry.maxPopulation > previous)) {
      throw new Error(`classification[${index}] maxPopulation must increase, and only the last class may be unbounded`);
    }
    previous = entry.maxPopulation;
  });
}

function validateNpc(npc, classIds) {
  if (!(Number.isInteger(npc?.target) && npc.target >= 0)) throw new Error('npc-population target must be a non-negative integer');
  for (const id of classIds) {
    const range = npc.ranges?.[id];
    if (!range || !Number.isInteger(range.min) || !Number.isInteger(range.max) || range.min < 0 || range.max < range.min) {
      throw new Error(`npc-population ranges.${id} needs integer min <= max`);
    }
  }
}

/** Reads the three YAML files; env vars override ports, host and map. */
export function loadConfig({ root = SIMULATOR_ROOT, env = process.env } = {}) {
  const simulator = readYaml(path.join(root, 'config/simulator.yaml'));
  const npc = readYaml(path.join(root, 'config/npc-population.yaml'));
  const pilot = readYaml(path.join(root, 'config/pilot-selection.yaml'));
  validateClassification(simulator.classification);
  validateNpc(npc, simulator.classification.map((c) => c.id));
  if (!Array.isArray(pilot?.roles) || pilot.roles.length !== 3) throw new Error('pilot-selection needs exactly three roles');

  simulator.server.host = env.WS_BACKEND_HOST ?? simulator.server.host;
  simulator.server.port = port(env.WS_BACKEND_PORT ?? simulator.server.port, 'server.port');
  simulator.frontend.port = port(env.WS_FRONTEND_PORT ?? simulator.frontend.port, 'frontend.port');
  simulator.world.mapId = env.WS_MAP_ID ?? simulator.world.mapId;
  return { root, simulator, npc, pilot };
}
