import { arch, release, type, version } from 'node:os';

export const PERF_CHROMIUM_GPU_ARGS = Object.freeze([
  '--enable-unsafe-webgpu',
  '--ignore-gpu-blocklist',
  '--use-angle=default',
  '--enable-gpu-rasterization',
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
]);

export async function readPerfEnvironment(browser) {
  const session = await browser.newBrowserCDPSession();
  try {
    const { gpu } = await session.send('SystemInfo.getInfo');
    const device = gpu.devices?.[0];
    if (!device) return null;
    return {
      os: { type: type(), release: release(), version: version(), arch: arch() },
      browser: browser.version(),
      gpu: {
        vendorId: device.vendorId,
        deviceId: device.deviceId,
        subSysId: device.subSysId ?? null,
        name: device.deviceString ?? null,
        driver: device.driverVersion ?? null,
        renderer: gpu.auxAttributes?.glRenderer ?? null,
      },
    };
  } finally {
    await session.detach();
  }
}

export function perfEnvironmentFingerprint(environment) {
  if (!environment?.browser || !environment.os?.release || !environment.gpu?.driver || !environment.gpu.renderer) return null;
  const { os, browser, gpu } = environment;
  return JSON.stringify([
    os.type, os.release, os.version, os.arch, browser,
    gpu.vendorId, gpu.deviceId, gpu.subSysId, gpu.name, gpu.driver, gpu.renderer,
  ]);
}
