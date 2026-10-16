import { createCompaction } from './meadowGrassCompaction.js';
import { createMeadowGroundSample } from './MeadowGroundSample.js';

/** Pure worker entry point, also exercised directly for byte-for-byte parity. */
export function buildMeadowCompaction(request, definition) {
  const template = { instanceCount: definition.count, userData: { meadow: definition.meadow },
    getAttribute: name => ({ array: definition.attributes[name] }) };
  const compaction = createCompaction({ template, centerX: request.centerX, centerZ: request.centerZ,
    sample: createMeadowGroundSample(request.snapshot), output: request.output,
    previous: request.previous });
  compaction.advance(Infinity);
  return { id: request.id, output: compaction.output, capacity: template.instanceCount,
    previousCapacity: request.previous?.capacity ?? 0 };
}
