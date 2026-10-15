# Four-light tree acceptance — October 15

**Failed.** [Raw report](report.json). Frozen application source `9b768d9a`,
current checked-in atlas signature `tree-impostor-v7-2e68faa7`, Windows hardware
NVIDIA Lovelace, fallback false, WebGPU and WebGL. All eight light/backend cases
completed, with zero browser errors. No threshold, asset, exposure, palette,
capture pose or render budget was changed.

The fixture executes 1,104 checks: 161 per WebGPU light, 115 per WebGL light.
Fifteen comparisons fail, all on prototype **27**, the production alpine
`tree10.glb`, comparing the near mesh to its impostor. The required median
interior luminance ratio is **0.8–1.25**; at light azimuth 0 the observed ratios
are approximately **0.760 day, 0.680 low-sun and 0.652 night**. Low-sun and night
also fail at azimuth 90. Overcast passes on both backends. CPU and GPU impostor
paths agree in the failed WebGPU comparisons. Coverage and median RGB error
remain within their limits; the failing condition is the luminance ratio.

Representative direct comparisons:

- [Day near](day-webgpu-tree-27-0-near.png),
  [day impostor](day-webgpu-tree-27-0-cpu-impostor.png).
- [Low-sun near](low-sun-webgpu-tree-27-0-near.png),
  [low-sun impostor](low-sun-webgpu-tree-27-0-cpu-impostor.png).
- [Night near](night-webgpu-tree-27-0-near.png),
  [night impostor](night-webgpu-tree-27-0-cpu-impostor.png).

The representation fixture uses the prescribed 42-degree sun elevation and four
azimuths while taking colours/intensities from each named preset. The full-world
lighting suite separately uses each preset's actual sun pose. The near and
impostor renders use the same geometry bounds, camera and input lighting. The
atlas's `foliageLighting=false` matches this vertex-coloured alpine crown; it is
not a missing metadata flag to force true.

Image inspection confirms darkening in the impostor. The physical cause has not
been isolated. Source review alone does not establish whether normal filtering,
bake colour/view dependence or another representation difference explains it.
The previous neutral-light pass must not be presented as an all-light pass.
This blocks current VQ-06/VQ-12 release acceptance.
