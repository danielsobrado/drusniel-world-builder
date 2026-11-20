export async function inspectCoastalScene(target) {
  const e = window.__editor;
  const { terrainView, stylizedSurface } = e;
  const { waterVisualClock } = await import('/src/editor/water/WaterVisualClock.js');
  const { seaStateUniforms } = await import('/src/editor/water/seaState.js');
  const { sampleWorldStoreSeaExposure } = await import('/src/editor/water/TerrainWaterQueries.js');
  const { seaExposure } = await import('/src/editor/water/WaterAppearance.js');
  const { PerfCounters } = await import('/src/editor/performance/qa/PerfCounters.js');
  const { halfToFloat, waterFieldHasCoverage } = await import('/src/editor/water/WaterField.js');
  const camera = e.viewModeController.camera;
  const canonical = terrainView.floatingOrigin.toCanonical(camera.position.x, camera.position.z);
  const { worldStore } = terrainView;
  const water = e.config.stylizedSurface.water;
  const swash = terrainView.coastalSwash;
  const impact = stylizedSurface.coastalRockImpact;
  const samples = target.map(({ x, z }) => {
    const water = terrainView.getCanonicalWater(x, z);
    const exposure = water.kind === 1 ? sampleWorldStoreSeaExposure(worldStore, x, z, water.shoreDistance) : null;
    const cx = Math.round(x / worldStore.tileSize), cz = Math.round(-z / worldStore.tileSize);
    const page = terrainView.slots.find(({ page }) => page && cx >= page.originX && cz >= page.originZ
      && cx <= page.originX + worldStore.chunkSize && cz <= page.originZ + worldStore.chunkSize)?.page;
    const index = page && ((cz - page.originZ) * page.waterFieldWidth + cx - page.originX) * 4;
    const appearance = page ? {
      cell: { x: cx, z: cz },
      kind: page.waterAppearancePixels[index],
      exposure: page.waterAppearancePixels[index + 3] / 255,
      shoreDistance: halfToFloat(page.waterFieldPixels[index + 3]),
    } : null;
    if (appearance?.kind === 1) appearance.transmission = Math.min(1, appearance.exposure / seaExposure(appearance.shoreDistance));
    return { x, z, water, exposure, transmission: exposure === null ? null : exposure / seaExposure(water.shoreDistance), appearance };
  });
  const pages = terrainView.slots.filter(slot => slot.page?.timings);
  return {
    canonicalCamera: { ...canonical, y: camera.position.y },
    cameraQuaternion: camera.quaternion.toArray(),
    renderOrigin: terrainView.floatingOrigin.getState(),
    fov: camera.fov,
    world: worldStore.generator.toMetadata(),
    backend: terrainView.rendererBackendStatus.mode,
    qualityTier: water.qualityTier,
    simulationSeconds: waterVisualClock.value,
    dayHour: e.dayNightCycle.hour,
    weather: { mode: e.weatherSettings.weatherMode, intensity: e.weatherSettings.weatherIntensity,
      seaStorm: seaStateUniforms.storm.value },
    opticsRefraction: water.refraction,
    finiteDepthRefraction: water.sea.surf.refraction,
    diffraction: water.sea.surf.diffraction,
    readiness: window.__worldVisualQa.readiness(),
    assetIntegrity: window.__worldVisualQa.diagnostics().assetIntegrity,
    swash: { supported: swash?.supported, initialized: swash?.initialized,
      eligible: swash?.inputs?.eligibleCount ?? 0, dispatches: swash?.dispatchCount ?? 0,
      inputBytes: swash?.inputs?.texture.image.data.byteLength ?? 0 },
    rock: { sites: impact?.sites.length ?? 0, events: impact?.eventCount ?? 0, droplets: impact?.spray?.live ?? 0,
      closestSites: impact?.sites.slice(0, 6).map(({ x, z, radius, exposure }) => ({ x, z, radius, exposure })) },
    counters: PerfCounters.snapshot(),
    pages: pages.map(({ page }) => ({
      key: page.key, waterGenerationMs: page.timings.waterGenerationMs,
      wet: waterFieldHasCoverage(page.waterFieldPixels), appearanceBytes: page.waterAppearancePixels.byteLength,
      fieldBytes: page.waterFieldPixels.byteLength + page.waterFlowPixels.byteLength,
    })),
    samples,
  };
}

export async function advanceCoastalClock({ end, start = null, impact = false }) {
  const qa = window.__worldVisualQa;
  const { waterVisualClock } = await import('/src/editor/water/WaterVisualClock.js');
  const editor = window.__editor;
  const rock = editor.stylizedSurface.coastalRockImpact;
  const camera = editor.viewModeController.camera;
  const projected = camera.position.clone();
  const paint = () => new Promise(resolve => requestAnimationFrame(resolve));
  let time = start ?? waterVisualClock.value;
  const events = rock?.eventCount ?? 0;
  let visibleSpray = false;
  while (time < end) {
    time = Math.min(time + 1 / 30, end);
    qa.setWaterTime(time);
    await paint();
    if (impact && rock?.eventCount > events && rock.spray?.live > 0) {
      visibleSpray = rock.spray.records.some(record => {
        if (!record || Math.abs(time - record.birth) > 1e-6) return false;
        const local = editor.terrainView.floatingOrigin.toRender(record.x, record.z);
        projected.set(local.x, record.y, local.z).project(camera);
        return Math.abs(projected.x) < 0.85 && Math.abs(projected.y) < 0.85
          && projected.z >= 0 && projected.z <= 1;
      });
      if (visibleSpray) break;
    }
  }
  return { time, impact: visibleSpray, impactEvents: (rock?.eventCount ?? 0) - events,
    droplets: rock?.spray?.live ?? 0 };
}

export async function measureCoastalFrame(durationMs) {
  const { GpuPassProfiler } = await import('/src/editor/performance/qa/GpuPassProfiler.js');
  const qa = window.__worldVisualQa;
  const { terrainView, stylizedSurface } = window.__editor;
  terrainView.renderer.backend.trackTimestamp = window.__coastalTimestampSupported;
  const gpu = new GpuPassProfiler(terrainView.renderer, { requested: true });
  const intervals = [], frameCpu = [], renderCpu = [], swashCpu = [], rockCpu = [];
  const rockRefreshCpu = [], sprayCpu = [];
  const rock = stylizedSurface.coastalRockImpact;
  const swash = terrainView.coastalSwash;
  const firstDispatch = swash?.dispatchCount ?? 0;
  const firstImpact = rock?.eventCount ?? 0;
  let sprayUploadBytes = 0;
  const restore = [];
  const wrap = (object, name, callback) => {
    if (!object) return;
    const original = object[name];
    object[name] = function (...args) { return callback.call(this, original, args); };
    restore.push(() => { object[name] = original; });
  };
  const timeCall = samples => function (original, args) {
    const start = performance.now();
    try { return original.apply(this, args); } finally { samples.push(performance.now() - start); }
  };
  wrap(terrainView, 'render', timeCall(renderCpu));
  wrap(swash, 'update', timeCall(swashCpu));
  wrap(rock, 'update', timeCall(rockCpu));
  wrap(rock, 'refresh', timeCall(rockRefreshCpu));
  if (rock?.spray?.capacity > 0) {
    wrap(rock.spray, 'update', timeCall(sprayCpu));
    const attributes = new Set([rock.spray.spawn, rock.spray.velocity, rock.spray.style]);
    wrap(terrainView.renderer.backend, 'updateAttribute', function (original, args) {
      const [attribute] = args;
      if (attributes.has(attribute)) sprayUploadBytes += attribute.array.byteLength;
      return original.apply(this, args);
    });
  }
  let start, prev, cpuStart;
  wrap(qa, 'beforeMovement', function (original, args) {
    const [now] = args;
    start ??= now;
    if (prev !== undefined) intervals.push(now - prev);
    prev = now;
    cpuStart = performance.now();
    gpu.beginFrame(now);
    return original.apply(this, args);
  });
  try {
    await new Promise(resolve => wrap(qa, 'afterFrame', function (original, args) {
      frameCpu.push(performance.now() - cpuStart);
      gpu.endFrame();
      if (args[0] - start >= durationMs) resolve();
      return original.apply(this, args);
    }));
  } finally {
    for (const undo of restore.reverse()) undo();
  }
  try {
    await gpu.pending;
    const stats = values => {
      const sorted = values.slice().sort((a, b) => a - b);
      return { samples: sorted.length, p50Ms: sorted[Math.floor(sorted.length * .5)] ?? null,
        p95Ms: sorted[Math.floor(sorted.length * .95)] ?? null };
    };
    const report = gpu.report();
    return {
      raf: stats(intervals), cpuAfterMovementHook: stats(frameCpu), renderCpu: stats(renderCpu),
      swashCpu: stats(swashCpu), rockCpu: stats(rockCpu),
      rockRefreshCpu: stats(rockRefreshCpu), sprayCpu: stats(sprayCpu), sprayUploadBytes,
      swashDispatches: (swash?.dispatchCount ?? 0) - firstDispatch,
      rockImpacts: (rock?.eventCount ?? 0) - firstImpact,
      gpuRender: { supported: report.supported, error: report.error, scope: report.scope, ...report.total },
    };
  } finally {
    gpu.dispose();
  }
}
