# Noise texture library (CC0)

Tileable greyscale noise for shaders and VFX. Source material only: nothing here
is served at runtime. To use one, convert what you need into
`public/assets/textures/` (pack up to three greyscale noises into the R, G and B
channels of one image so a shader pays one fetch) and load it where it is used,
never at startup.

- `cracks/ craters/ gabor/ grainy/ manifold/ marble/ melt/ milky/ perlin/ spokes/
  streak/ super-noise/ super-perlin/ swirl/ techno/ turbulence/ vein/ voronoi/` —
  Screaming Brain Studios "Noise Texture Pack", 512x512 PNG, 14 per family
  (24 Perlin). CC0: see `LICENSE-screaming-brain-studios.txt`.
- `misc/` — 36 loose 512x512 JPGs (gradients, rays, cells, clouds, cracks, a few
  coloured or photographic). CC0 as stated by the project owner on 2026-11-15;
  their original download pages were not recorded.

Good first uses: `voronoi` for melt scallops and cells, `cracks`/`vein` for
fracture networks, `streak`/`melt`/`gabor` for flow bands and wind ridges,
`super-perlin`/`milky`/`turbulence` for cloud, smoke and mist erosion,
`spokes` and `misc/6070|6123|6124` for rays, glows and radial wipes.
