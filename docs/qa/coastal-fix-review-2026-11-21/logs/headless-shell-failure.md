# Default headless shell · before channel selection

`npm run qa:water:acceptance -- --out tmp/coast-water-acceptance-headless.json` exited 1 on Windows with Chromium 151.0.7922.34. The self-started Vite server reached port 5173. The app logged `No WebGPU device; starting on the WebGL renderer profile.` Route discovery then timed out at the initial scene-readiness wait after 120 seconds. The route never started and no acceptance payload was written. The separate empty-page device probe identified the DXIL library error before app initialization. [Device probe](headless-device-probe.json)
