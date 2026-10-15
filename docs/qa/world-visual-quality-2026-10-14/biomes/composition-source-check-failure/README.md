# Seventeen-view source-check failure — October 15

The [raw report](report.json) is **failed**, despite all 17 poses reaching full
readiness and producing captures with zero browser errors. The frozen server
stopped before the final source-manifest fetch, which failed with `fetch failed`.
No final source-stability check was recorded. The failed report is not relabelled
as accepted evidence; all 34 images and their declared hashes are retained.

The source at capture start was `9b768d9a`. A detached server at the identical
revision now supports a full repeat in a fresh browser. The previous interactive
server lifetime is an infrastructure failure, not a scenery or biome failure.
The exact reason the server received termination was not established.
