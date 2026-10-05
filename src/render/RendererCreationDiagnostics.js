/** The only adapter using Three's internal creation hooks. Restored on renderer disposal. */
export class RendererCreationDiagnostics {
  constructor(renderer, trace) {
    this.restores = [];
    this.support = {};
    trace.hookSupport = this.support;
    this.live = true;
    if (!trace.enabled) return;
    const family = object => {
      const name = `${object?.name ?? ''} ${object?.material?.name ?? ''}`.toLowerCase();
      return ['terrain', 'water', 'tree', 'meadow', 'snow', 'rain', 'character', 'construction', 'tropical']
        .find(value => name.includes(value)) ?? 'other';
    };
    const wrap = (target, name, kind) => {
      if (typeof target?.[name] !== 'function') { this.support[name] = false; return; }
      this.support[name] = true;
      const original = target[name];
      const adapter = this;
      function wrapped(...args) {
        const start = trace.clock();
        try { return original.apply(this, args); }
        finally { if (adapter.live) trace.record(kind, 'backend', trace.clock() - start); }
      }
      target[name] = wrapped;
      this.restores.push(() => { if (target[name] === wrapped) target[name] = original; });
    };
    for (const name of ['createProgram', 'createRenderPipeline', 'createComputePipeline',
      'createAttribute', 'createIndexAttribute', 'createStorageAttribute', 'updateAttribute', 'createTexture', 'updateTexture']) {
      wrap(renderer.backend, name, name);
    }
    const debug = renderer.debug;
    this.support.nodeBuilder = Boolean(debug && 'onNodeBuilderCreated' in debug);
    if (this.support.nodeBuilder) {
      const previous = debug.onNodeBuilderCreated;
      const adapter = this;
      const hook = (builder, target) => {
        previous?.(builder, target);
        const originals = { build: builder.build, buildAsync: builder.buildAsync };
        const restore = () => { for (const [name, original] of Object.entries(originals)) if (original) builder[name] = original; };
        const recordBuild = (start, kind) => {
          if (!adapter.live) return;
          trace.record(kind, family(target?.object ?? target ?? builder.object), trace.clock() - start,
            builder.fragmentShader ?? builder.computeShader);
          const samplers = (builder.fragmentShader ?? '').match(/^.*:\s*sampler.*$/gm) ?? [];
          if (samplers.length > 16 && !trace.samplerOverflow) trace.samplerOverflow = {
            object: builder.object?.name, material: builder.material?.name, samplers,
            textures: (builder.uniforms?.fragment ?? []).filter(row => row.node?.isTextureNode)
              .map(row => ({ name: row.name, texture: row.node.value?.name, image: row.node.value?.image?.src,
                sampler: row.node.sampler, uuid: row.node.value?.uuid })),
          };
        };
        // One-shot wrapper: builders cannot retain a disposed diagnostic collector.
        builder.build = function (...args) {
          restore();
          const start = trace.clock();
          try { return originals.build.apply(this, args); }
          finally { recordBuild(start, 'nodeBuild'); }
        };
        if (originals.buildAsync) builder.buildAsync = async function (...args) {
          restore();
          const start = trace.clock();
          try { return await originals.buildAsync.apply(this, args); }
          finally { recordBuild(start, 'nodeBuildAsyncWall'); }
        };
      };
      debug.onNodeBuilderCreated = hook;
      this.restores.push(() => { if (debug.onNodeBuilderCreated === hook) debug.onNodeBuilderCreated = previous; });
    }
  }

  dispose() { this.live = false; this.restores.reverse().forEach(restore => restore()); this.restores.length = 0; }
}
