# PR I — Phase I.1: spectrum model and Fourier reference

Part of [PR I: far-offshore FFT ocean](ponlai-pr-i-far-offshore-fft-ocean-coastal-blending-2026-11-21.md), §4 and §13.1.

**Status:** done. This phase is CPU-only. It adds no WebGPU code, shaders, textures, configuration schema or render hooks, and nothing in the runtime imports it. It does not validate GPU FFT correctness; that is Phase I.2.

**Phase I.0:** I.0's report, `ponlai-pr-i-phase-i0-audit-and-baseline-2026-11-21.md`, was an **uncommitted draft** in the shared checkout when this was committed; it is not on `main`. I.1 was reconciled with its Decisions A, B, E and G (§12). Those decisions are still the I.0 session's and are not claimed here as passed gates.

## 1. Summary

- A seeded directional wind-sea spectrum: TMA-corrected JONSWAP, Donelan–Banner spreading, converted to a 2D wave-number density.
- A high-pass that gives exactly zero energy at or above the 7.5 m analytic swell carriers.
- Seeded Gaussian modes keyed by each mode's identity.
- Tessendorf evolution on a quantised, exactly periodic clock.
- Packed-slope and vec4 GPU layouts.
- A direct 2D DFT oracle for 8² and 16² grids.
- 31 tests across three files.

The model only covers the local short-wave wind sea, in metres. The long swell stays analytic in `SeaSwell.js`, unchanged.

## 2. Files

| File | Responsibility |
| --- | --- |
| `src/editor/water/fft/OceanFftConstants.js` | Units and axes, gravity, JONSWAP/TMA/spreading constants, numerical guards, input limits. Provisional high-pass and cascade defaults; carrier phase-speed scale (read from `SeaSwell`); repeat period. No state. |
| `src/editor/water/fft/OceanSpectrum.js` | Pure functions: indexing, dispersion and its Jacobian, JONSWAP, TMA, spreading, high-pass, cascade bands, 2D density, per-mode power table, quantised frequency table, expected height/slope variance, carrier variance, Cox–Munk prior. |
| `src/editor/water/fft/OceanGaussianModes.js` | Seeded N(0,1) pairs per mode (integer hash, no shared RNG state), h0 = Gaussians × power, and the vec4 GPU packing. |
| `src/editor/water/fft/OceanFourierReference.js` | Reference only: time evolution, spectral derivative, packed slope spectrum, direct forward/inverse DFT, point sampling. |
| `test/helpers/oceanFftFixtures.js` | Builds one cascade the way the runtime will; shared parameter fixtures. |
| `test/ocean-fft-spectrum.test.js` | Spectrum maths, band isolation, energy, robustness (13 tests). |
| `test/ocean-fft-fourier.test.js` | DFT, Hermitian symmetry, Parseval, travel, derivatives, periodicity, packing (12 tests). |
| `test/ocean-fft-determinism.test.js` | Seeds, golden values, order independence, Gaussian statistics, seeking (6 tests). |

No existing source or test was modified.

## 3. Source references

Drusniel (read, not changed): `src/editor/water/SeaSwell.js` (carriers 42/26/17/11/7.5 m, `PHASE_SPEED_SCALE` 0.55), `SeaDetailPolicy.js` (ripple groups), `seaState.js` and `WaterVisualClock.js` (absolute water clock; QA override 0–86 400 s; live time unbounded), `SeaConfig.js`, `docs/architecture/water-domain-contract.md`. No spectrum, Box–Muller or Tessendorf code existed in `src`.

Ponlai at `cca905649fe657458697a9e1b179113c97ce5e6e`:
- `packages/render/ocean/OceanSpectrum.ts`: JONSWAP/TMA, cos-2s/cos² spreading, Jacobian, Cox–Munk budget, sea-state presets.
- `packages/render/ocean/OceanFFT.ts`: sequential mulberry32 Gaussians, `h0 = gauss·√(E·Δk²/2)·amplitude/√2`, `exp(+iωt)`, Stockham IFFT without normalisation, cascades [733, 157, 33.3, 7.1] m.

Both files carry "Portions adapted from tidewater by Daniel Greenheck", SPDX `MIT`, © 2026 DRG Software Solutions LLC.

**No Ponlai or tidewater code was copied.** The formulas are standard results from the literature: Hasselmann 1973 (JONSWAP and the fetch-limited α and ω_p fit), Bouws 1985 / Kitaigorodskii (TMA), Donelan, Hamilton & Hui 1985 (spreading), Tessendorf 2001 (evolution), and Cox & Munk 1954 (slope prior). No MIT notice is therefore required; I.0 §8 agrees.

## 4. Equations

```text
ω(k)     = sqrt(g·k·tanh(k·d))          (k·d > 20 → deep water; k ≤ 0 → 0)
dω/dk    = g·(tanh(kd) + kd·sech²(kd)) / 2ω
α        = 0.076·(U²/(F·g))^0.22
ω_p      = 22·(g²/(U·F))^(1/3)
S(ω)     = α·g²/ω⁵ · exp(−1.25(ω_p/ω)⁴) · γ^r,   r = exp(−(ω−ω_p)²/(2σ²ω_p²)),  σ = 0.07 | 0.09,  γ = 3.3
Φ(ω_h)   = ω_h²/2 (ω_h ≤ 1),  1 − (2−ω_h)²/2 (ω_h < 2),  1 otherwise;   ω_h = ω·sqrt(d/g)
D(θ)     = β/(2·tanh(βπ)) · sech²(βθ)    Donelan–Banner β(ω/ω_p), ratio clamped ≥ 0.56
P(kx,kz) = S(ω)·Φ·D(θ)·(dω/dk)/k · exp(−(k·0.02)²) · highPass(k)        [m⁴]
mode power   = P·Δk²   (DC, Nyquist row/column and out-of-band modes = 0)
h0(k)        = (ξ_re + i·ξ_im)·sqrt(P·Δk²)/2,  ξ ~ N(0,1)

cycles(k)    = round(0.55·ω(k)·T / 2π),  ω_q = cycles·2π/T,  T = 512 s
τ            = (t mod T)/T  (double),   φ = 2π·fract(cycles·τ)
h(k,t)       = h0(k)·e^(−iφ) + conj(h0(−k))·e^(+iφ)
field(x,z)   = Σ_k h(k,t)·e^(+i(kx·x + kz·z))
slope_x,z    = Σ_k (i·kx | i·kz)·h·e^(+ik·x);   packed: Σ (i·kx·h − kz·h)·e^(+ik·x) = sx + i·sz
E[H²]        = Σ P·Δk²,   E[sx² + sz²] = Σ P·Δk²·|k|²
```

- The spectrum (energy) uses physical dispersion. Only the evolution speed is scaled by 0.55, matching the carriers and ripples (I.0 Decision A).
- The 0.55 is read back from `SEA_SWELL_COMPONENTS`, not duplicated.
- `phaseSpeedScale: 1` restores physical speed.

## 5. Units and conventions

- SI units: metres, m/s, rad/m, rad/s, seconds.
- Drusniel canonical X/Z, with height along +Y.
- Wind direction is the heading the wind blows **toward**, in radians from +X toward +Z. Waves travel downwind, which a test proves.
- Time is the absolute `WaterVisualClock` seconds, supplied by the caller. The sea repeats exactly every T = 512 s, and there is no accumulated phase.
- **Calm policy:** `windSpeed < 1e-3` m/s gives an exactly zero spectrum. Ponlai clamps U to 0.1.
- Depth defaults to `Infinity`. TMA applies only when a finite reference depth is passed. Ponlai's 500 m default is not used.

## 6. Seed and mode layout

- **Layout:** complex arrays are interleaved `[re, im]` per mode, flat index `q·N + p`. Here p is the kx index and q is the kz index, and `signedIndex(i) = i < N/2 ? i : i − N`. The vector is `kx = signedIndex(p)·2π/L`, `kz = signedIndex(q)·2π/L`.
- **Mirror:** the −k partner is `((N−q) mod N)·N + ((N−p) mod N)`.
- **Gaussian keying:** each pair depends only on (seed, cascadeIndex, signed kx index, signed kz index):
  ```text
  h = fmix32(fmix32(fmix32(fmix32(fmix32(seedLo) ^ seedHi) ^ cascade) ^ sp) ^ sq)
  u1 = max(mulberry32(h + 0x6D2B79F5), 1e-9),  u2 = mulberry32(h + 2·0x6D2B79F5)
  ξ_re = sqrt(−2 ln u1)·cos(2πu2),  ξ_im = sqrt(−2 ln u1)·sin(2πu2)
  ```
  `seedLo` and `seedHi` are the two's-complement 64-bit words of any safe integer.
- **Consequences:** pairs survive changes of N and of scan order. Gaussians are independent of the spectrum, so a wind change rebuilds h0 without reseeding.

## 7. Frequency-band ownership

| Owner | Wavelength | k (rad/m) | Status |
| --- | --- | --- | --- |
| Analytic carriers (`SeaSwell`) | ≥ 7.5 m | ≤ 0.838 | Confirmed in code; I.0 agrees |
| High-pass knee (smoothstep 0→1) | 7.5 → 5.5 m | 0.838 → 1.142 | I.0 keeps it |
| Cascade 0, 48 m tile | 7.5 → 2 m | [0.838, 3.142) | I.0 keeps it; final size I.3 |
| Cascade 1, 12 m tile | 2 → 0.5 m | [3.142, 12.566) | I.0 keeps it; final size I.3 |
| Medium detail, index 0 (`seaDetail0/1`) | 2.0 / 1.77 m | inside FFT band | **Replace** in I.4 |
| Medium detail, index 1 (`seaDetail2/3`) | 0.95 / 0.84 m | inside FFT band | **Replace** in I.4 |
| Fine detail, index 2 (`seaDetail4/5`) | 0.35 / 0.31 m | above band | Keep |

- The bands are half-open, so no mode is counted twice. Each band ends below its N=64 Nyquist.
- The high-pass takes `{ cutoffWavelength, fullWavelength }` as a parameter, defaulting to `DEFAULT_HIGH_PASS`. Cascades are `CASCADE_CANDIDATES`.
- **Correction since `d304aa53`:** that commit's test treated only index 1 as overlapping. I.0 found that index 0, which carries 78 % of the medium weight, is in band too. The test now asserts the whole medium group is in band and the fine group above it.

## 8. FFT normalisation

- The inverse transform the GPU must reproduce is `synthesize2d`: Σ H·e^(+ik·x), with **no** 1/N². This matches Ponlai's Stockham IFFT.
- Spectral cell area Δk² is applied once, in the mode power.
- The amplitude factor is `/2`, not the spec sketch's `/√2`. The conjugate partner contributes the other half of the variance, and the seed-averaged test confirms E[H²] = ΣP·Δk². A `/√2` mutation fails that test.
- `inverseDft2d` (1/N²) and `forwardDft2d` exist only for the identity test.
- **Time sign:** the sign is opposite to Ponlai, whose own comment notes that its `e^(+iωt)` travels against k. A time-sign mutation fails the travel test; this was re-checked after the quantised-clock rewrite.

## 9. Test results

`node --test test/ocean-fft-*.test.js`: **31/31 pass**.

| Property | Result |
| --- | --- |
| Forward→inverse DFT, 8² and 16² | max error < 1e-12 |
| Constant, single and two-mode spectra | match closed form to 1e-12 |
| Hermitian evolved spectrum | mirror pairs equal/negated to < 1e-15 |
| Imaginary residual of height and both slopes | ≤ 1e-12 × max real |
| Parseval, 8² and 16² | relative error ≤ 1e-12 |
| Seed-averaged variance (32 seeds) vs ΣP·Δk² | within 15% (statistical) |
| Single +x mode at t = 0, 1, 10 | equals cos(kx − ω_q·t) to 1e-12 |
| Spectral slope vs central difference | < 1e-6 |
| Packed slope spectrum vs separate slopes | ≤ 1e-12 relative |
| Periodicity t vs t + 7T (t = 0, 123.4, 127.3, 3600.25, −40.5) | < 1e-9 |
| Quantised ω vs 0.55·ω(k) | within π/T for every mode; cycles are integers |
| vec4 packing | exact float32 of (h0(k), conj h0(−k)) |
| Dispersion | deep limit exact; shallow `k·sqrt(gd)` to 1e-4; Jacobian vs numeric to 1e-6 at d = 0.5, 4, ∞ |
| JONSWAP / TMA | peak = γ × Pierson–Moskowitz at ω_p; Φ(1) = ½, Φ(2) = 1 |
| Spreading | integrates to 1 ± 1e-6; energy centroid follows heading within 0.05 rad |
| Carriers | zero density and zero mode power at every carrier and at k ≤ k0 |
| Lattice refinement N=64/L=24 vs N=128/L=48 | height and slope variance within 5% |
| Wind 1→30 m/s | slope variance strictly increasing; +1 mm/s changes it < 0.1% |
| Invalid inputs | each throws `RangeError` naming the parameter |

**Residual energy, both cascades, fetch 50 km, deep water:**

| U (m/s) | ω_p (rad/s) | RMS height (m) | Mean-square slope | Cox–Munk total |
| --- | --- | --- | --- | --- |
| 3 | 1.897 | 0.040 | 0.0084 | 0.0184 |
| 7 | 1.431 | 0.050 | 0.0125 | 0.0388 |
| 10 | 1.270 | 0.054 | 0.0147 | 0.0542 |
| 20 | 1.008 | 0.064 | 0.0200 | 0.1054 |
| 40 | 0.800 | 0.074 | 0.0271 | 0.2078 |

For comparison, the five carriers at amplitude 0.9 m (sharpness 0) give 0.39 m RMS and a mean-square slope of 0.0057. The FFT residual adds roughly 1.5–5× the carriers' slope variance while adding very little height. This is physics only; any artistic gain belongs in the quality profile.

**Full suite and build:**
- `npm test`: 5012 / 5013 pass. The one failure is `test/render-probe-lock.test.js` (*both render probes reject a live hardware QA lock before launching a browser*). It fails with "Performance matrix is already running as PID 21728": another session's live performance run holds the QA lock. It fails the same way on its own and touches no FFT code.
- `npm run lint`: clean.
- `npm run build`: succeeds.

## 10. Determinism evidence

- The same seed (7, 1234, −4 226 432 278 528) produces bit-identical Gaussians, h0 and evolved spectra.
- Golden values for seed 1234, N=8, entries 0–3 and 126–127 are locked: `[-0.230921646853, -0.245678547657, 1.558012244052, -0.247714294551, -0.223804632022, 1.118692397037]`.
- Different seeds and cascades produce different patterns with an identical power table.
- Visiting modes in reverse, one at a time, reproduces the table. N=8 and N=32 agree on every shared signed index.
- Gaussian statistics over 4096 modes for four seeds: mean within 0.06, variance within 0.08 of 1, real/imaginary covariance within 0.06. These are fixed seeds, not random.
- Seeking t = 123.4, 124.6, 126.0, 127.6 forwards and backwards gives identical arrays. Reusing the output buffer leaks nothing. t = 86 400 and −3.6e6 stay finite.

## 11. Limitations and TODOs

- TODO(I.0): when the I.0 report lands on `main`, re-check §12. If it changes the period, phase-speed scale, knee or cascades, update the defaults in `OceanFftConstants.js` and the golden fixtures in §13.
- TODO(I.3): choose the final tile sizes from short-wave limits. 48 m and 12 m are candidates.
- No distant-swell system and no depth-varying spectrum; shallow damping stays with the existing coast fields (I.0 Decision F).
- Spreading is Donelan–Banner alone, not Ponlai's cos-2s/cos² blend with a fitted normaliser. It was chosen because its normalisation is exact and closed-form.
- Quantisation shifts ω by at most π/T (0.006 rad/s), at most 0.4 % for energetic modes at the 7.5 m knee.

## 12. Phase I.0 compatibility

| I.0 draft decision | I.1 status |
| --- | --- |
| A: carriers own ≥ 7.5 m, knee 7.5→5.5 m, 48/12 m candidate cascades | Matches |
| A: whole medium detail group in band | Test corrected (index 0 and 1 in band, index 2 above) |
| A: FFT evolution at the carriers' 0.55× phase speed, oracle on the same ω | `CARRIER_PHASE_SPEED_SCALE`, read from `SeaSwell` without modifying it |
| B: both slopes in one complex IFFT, `C = i·kx·h − kz·h` | `packedSlopeSpectrum` + test |
| E: ω quantised to T = 512 s, τ = (t mod T)/T in double, φ = 2π·fract(m·τ) | `createWaveFrequencies` + `evolveSpectrum`; periodicity test |
| E: canonical X/Z axes, I.1 time sign kept in the GPU kernel | Matches |
| G: h0 uploaded as vec4 `(h0(k), conj h0(−k))` f32, built on CPU; no GPU spectrum kernel | `packInitialSpectrum` + test |
| G: spectrum rebuild ~7.5 ms for 128²×2, time-sliced on wind change | Out of scope (runtime, I.2/I.5) |

I.0 is not on `main`, so none of its gates is claimed as passed.

## 13. Phase I.2 handoff

**CPU initialisation, reusable at runtime, once per wind or seed change:**

| Function | Produces |
| --- | --- |
| `resolveOceanSpectrumParams` | validated parameters |
| `createModePowerTable` | P·Δk² per mode |
| `createGaussianModes` | Gaussians, once per seed |
| `createInitialSpectrum` | h0 |
| `packInitialSpectrum` | Float32Array(4N²) to upload |
| `createWaveFrequencies` | integer cycles per mode |

**Reference only, never at runtime:** `evolveSpectrum`, `repeatFraction`, `spectralDerivative`, `packedSlopeSpectrum`, `synthesize2d`, `inverseDft2d`, `forwardDft2d` and `sampleField`.

**Buffers per cascade:**

| Buffer | Format | Contents |
| --- | --- | --- |
| `h0` | `array<vec4<f32>>`, N², index `q·N + p` | `(h0(k).re, h0(k).im, conj h0(−k).re, conj h0(−k).im)` |
| `cycles` | `array<f32>`, N² | Integers ≤ 683 at 64² for both candidate cascades, exact in f32. Or recomputed in the shader with the same rounding |
| `τ` | uniform | `repeatFraction(waterVisualClock, 512)`, computed in double on the CPU each frame |

**Evolution kernel:**
```text
φ = 2π·fract(cycles·τ);  h = h0·e^(−iφ) + conjMirror·e^(+iφ)
C = i·kx·h − kz·h     →  one IFFT per cascade (sx + i·sz)
```
- `kx = signedIndex(p)·2π/L`, `kz = signedIndex(q)·2π/L`.
- DC and Nyquist are already zero in h0.
- IFFT uses `+i` twiddles and **no** 1/N². The spatial result's row is z and its column is x.

**Sign checks:**
- Using Ponlai's `+iφ` on h0 makes the sea run upwind.
- Wind heading 0 means waves travel toward +X; π/2 means toward +Z.

**GPU fixtures:**
- Use spectrum `windSpeed 10, windDirection 0, fetchMeters 50 000`, deep water, full band, tile 6 m, seed 1234, default frequencies (0.55, T = 512).
- Run at times 0, 1, 10, 123.4, 124.6, 126.0, 127.3 and 127.6 s, plus a single-mode +x fixture at L = 32 m. Mode (1,0) at L = 6 has 144 cycles.
- CPU values for the height field:

| N | t (s) | RMS | max abs | field[0,0] | field[x=1,z=0] |
| --- | --- | --- | --- | --- | --- |
| 8 | 0 | 6.072421e-2 | 1.439323e-1 | 1.170354174e-1 | 1.365827639e-1 |
| 8 | 127.3 | 6.954611e-2 | 1.595515e-1 | 3.947269148e-2 | -4.155316557e-2 |
| 16 | 0 | 6.149258e-2 | 1.655032e-1 | 1.130934058e-1 | 1.542683992e-1 |
| 16 | 127.3 | 7.028670e-2 | 1.697622e-1 | 4.947032325e-2 | -2.752007251e-2 |

**Tolerances (proposed):**
- 8² and 16²: per-sample `|gpu − cpu| ≤ 1e-5·max|cpu| + 1e-7`. The f32 FFT's rounding is about `log₂N·2⁻²⁴`, and f32 h0 storage adds about 6e-8 relative.
- Slopes: the same tolerance against their own max.
- 64²: compare RMS to 1e-4 relative and spot-check samples with the same tolerance.

**Float32 precision:**
- Raw `ω·t` in f32 is unusable: at t = 86 400 s, ω·t ≈ 10⁶ rad with an ulp of 0.06 rad, and live time is unbounded.
- With τ from double and `cycles ≤ 683`, `cycles·τ` in f32 errs by under 683·2⁻²⁴ ≈ 4e-5 cycle.
- `fract` must be taken before multiplying by 2π.
