import { buildMeadowCompaction } from './buildMeadowCompaction.js';
import { resolveGroundSnapshot } from './MeadowSharedGroundInputs.js';

const templates = new Map();
const grounds = new Map();
self.addEventListener('message', ({ data }) => {
  if (data.type === 'template') { templates.set(data.id, data.definition); return; }
  if (data.type !== 'build') return;
  try {
    const started = performance.now();
    const request = { ...data, snapshot: resolveGroundSnapshot(grounds, data) };
    const result = buildMeadowCompaction(request, templates.get(data.templateId));
    result.execMs = performance.now() - started;
    self.postMessage(result, ['position', 'rotation', 'data'].map(name => result.output[name].buffer));
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
});
