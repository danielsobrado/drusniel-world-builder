const DECLARATION = /^.*@binding\(\s*\d+\s*\).*@group\(\s*\d+\s*\).*var\s+\w+\s*:\s*sampler(?:_comparison)?\s*;.*$/gm;

/** Three 0.186.1 binds samplers for filterable textureLoad-only inputs. */
export function pruneUnusedSamplerBindings(builder) {
  const stages = ['vertexShader', 'fragmentShader', 'computeShader'];
  const executable = stages.map(stage => (builder[stage] ?? '').replace(DECLARATION, '')).join('\n');
  const groups = builder.getBindings();
  const remap = new Map();
  let removed = 0;
  const nextGroups = groups.map(group => {
    const id = builder.bindingsIndexes[group.name]?.group;
    if (id === undefined) return group;
    const bindings = [];
    group.bindings.forEach((binding, index) => {
      const unused = binding.isSampler && !new RegExp(`\\b${binding.name}\\b`).test(executable);
      if (unused) { remap.set(`${id}:${index}`, null); removed++; }
      else { remap.set(`${id}:${index}`, bindings.length); bindings.push(binding); }
    });
    return bindings.length === group.bindings.length ? group : new group.constructor(group.name, bindings);
  });
  if (!removed) return 0;
  for (const stage of stages) {
    if (!builder[stage]) continue;
    builder[stage] = builder[stage].replace(/^.*@binding\(\s*(\d+)\s*\)\s*@group\(\s*(\d+)\s*\).*$/gm, (line, binding, group) => {
      const key = `${group}:${binding}`;
      if (!remap.has(key)) return line;
      const index = remap.get(key);
      return index === null ? '' : line.replace(/@binding\(\s*\d+\s*\)/, `@binding( ${index} )`);
    });
  }
  builder.bindGroups = nextGroups;
  return removed;
}

export function installUnusedSamplerPruning(renderer) {
  const debug = renderer.debug;
  const previous = debug.onNodeBuilderCreated;
  const hook = (builder, target) => {
    previous?.(builder, target);
    if (!renderer.backend?.isWebGPUBackend) return;
    const original = builder.build;
    const originalAsync = builder.buildAsync;
    const restore = () => { builder.build = original; if (originalAsync) builder.buildAsync = originalAsync; };
    builder.build = function (...args) {
      restore();
      const result = original.apply(this, args);
      pruneUnusedSamplerBindings(this);
      return result;
    };
    if (originalAsync) builder.buildAsync = async function (...args) {
      restore();
      const result = await originalAsync.apply(this, args);
      pruneUnusedSamplerBindings(this);
      return result;
    };
  };
  debug.onNodeBuilderCreated = hook;
  return { dispose() { if (debug.onNodeBuilderCreated === hook) debug.onNodeBuilderCreated = previous; } };
}
