# Foliage motion and palette alignment

Trees and understory now respond to the meadow's shared wind field. Tree crowns
bend in a rooted arc with a small crosswind flutter at their tips, faded before
it becomes subpixel noise. Their travelling-wave phase uses canonical world
coordinates, so moving the instance anchor cannot reset the pose. Near crowns
and proxies share the bend; distant billboards keep their foot planted and move
with the wind in world axes.

Authored bushes and their proxies previously stood rigid. They now use the
existing meadow-driven ground-detail bend. Ground-detail grass motion is unchanged.

Understory green pigment bridges the configured meadow base/tip and canopy
shadow/light ramps. Painted stems and blossoms retain their colors. Bush proxy
gradients use prototype height rather than the already placed instance height.
Floating leaves use three shades from the same ramp and ease between nearby
forest biome palettes, updating uniforms without repainting their texture.
Explicit floating-leaf palette overrides are retained.

## Verification

Run the deterministic rendering check against a serving development instance:

```powershell
rtk proxy node scripts/run-foliage-motion-qa.mjs --url http://localhost:5174
```

The fixture exercises production instancing and materials on WebGPU and WebGL,
captures fixed times, then moves the render origin and instance anchor while
holding canonical placement constant. It also compiles the production foliage
palette and floating-leaf materials. Hardware captures used an NVIDIA Lovelace
WebGPU adapter with `fallback: false`.

Before the change, tree/anchor differences measured 1.16 RGB byte levels per
image channel for the near tree and 0.92 for the proxy; both bush bands had zero
motion. Afterward, all four representations move, origin-shift difference is
zero, and anchor-shift difference is at most 0.002 RGB byte levels. Both
renderers passed. Billboard checks additionally require the bottom scanline to
stay planted while the upper part moves.

Palette regression tests cover eased biome changes, retained explicit overrides,
and reuse of the leaf texture. The complete suite passed 3,537 tests; lint and
the production build passed.

World performance QA was attempted before and after the change. The initial run
timed out waiting for `window.__perfQa` during application startup, before any
measurements. The subsequent headed `chunk-cross --warmup 8 --duration 12 --settle`
run completed on the hardware WebGPU adapter without browser errors: 112.6 FPS,
12.4 ms frame p95, 16.4 ms p99, and one 48.3 ms hitch. Collision readiness passed.
This is a valid post-change capture, but the initial failure prevents a controlled
performance comparison. The change does not alter scatter, density, streaming,
residency, instance attributes or draw counts.
