export function locationTransitionVerdict(report) {
  const failures = [];
  if (report.adapter?.webgpu !== true || report.adapter?.isFallbackAdapter === true
      || !/nvidia|0x10de/i.test(String(report.adapter?.vendor) + ' ' + String(report.adapter?.description))
      || /swiftshader|software|llvmpipe/i.test(String(report.adapter?.description))) failures.push('NVIDIA WebGPU adapter not verified');
  if (report.surfaceReady !== true) failures.push('initial surface not ready');
  if (report.focus?.passed !== true) failures.push('foreground focus not verified');
  if (report.errors?.count !== 0) failures.push('browser errors or missing error evidence');
  if (!Number.isSafeInteger(report.cycles) || report.cycles < 1 || report.cycleResults?.length !== report.cycles) failures.push('incomplete cycle count');
  for (const cycle of report.cycleResults ?? []) {
    if (cycle.entered !== true || cycle.exited !== true || cycle.surfaceSettled !== true
        || !Number.isSafeInteger(cycle.firstReturnFrames) || cycle.firstReturnFrames < 120
        || report.phases?.['c' + cycle.cycle + ':first-return']?.frames !== 120
        || !Number.isFinite(cycle.peakAccountedBytes) || cycle.peakAccountedBytes <= 0
        || cycle.inside?.state !== 'inside' || cycle.after?.state !== 'idle') failures.push('incomplete cycle ' + cycle.cycle);
  }
  if (report.failure || report.captureError || !Array.isArray(report.frames) || !report.frames.length) failures.push('missing or failed raw capture');
  return { passed: failures.length === 0, failures };
}
