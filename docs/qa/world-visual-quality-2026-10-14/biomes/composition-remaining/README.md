# Remaining aerial and imported views — October 15

The [repeat report](report.json) passes all **17 views**, with complete readiness,
the expected biome IDs, stable immutable source and zero browser errors.
Application source: `9b768d9a`. Hardware NVIDIA Lovelace WebGPU, fallback false,
1600×900, DPR 1, Highfield at paused noon.

The run covers the aerial marine coast; ground, reverse and aerial views of
Eldara forest (6), taiga (9), tundra (10), glacier (11) and wetland (12); and the
additional wetland shore. Each view retains a clean renderer PNG and a HUD PNG,
for **34 images**. Aerial destinations prepare real collision at the same ground
point before the exact fly pose is applied; both preparations are recorded.

The previous run captured all 17 views but lost the final source check when its
server stopped. Its [failed report and images](../composition-source-check-failure/README.md)
are preserved. This repeat uses a detached, immutable server and establishes the
final source check. No readiness threshold or canonical pose was changed.

These views complete the previously missing aerial/imported inventory. They do
not turn the earlier 36-view run at a different source into a current all-suite
aggregate, and do not clear the separate scenery-recovery or performance gates.
