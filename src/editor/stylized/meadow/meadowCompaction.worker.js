import { buildMeadowCompaction } from './buildMeadowCompaction.js';

const templates = new Map();
self.addEventListener('message', ({ data }) => {
  if (data.type === 'template') { templates.set(data.id, data.definition); return; }
  if (data.type !== 'build') return;
  try {
    const result = buildMeadowCompaction(data, templates.get(data.templateId));
    self.postMessage(result, ['position', 'rotation', 'data'].map(name => result.output[name].buffer));
  } catch (error) { self.postMessage({ id: data.id, error: String(error?.message ?? error) }); }
});
