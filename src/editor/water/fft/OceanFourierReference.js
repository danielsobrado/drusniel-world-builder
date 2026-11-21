/**
 * Tiny direct 2D DFT oracle for the FFT ocean tests. O(N⁴): test fixture only,
 * never imported by the runtime. Arrays are row-major, index = z·N + x, with
 * exp(+i·2π(p·x + q·z)/N) on the inverse.
 */

function transform(re, im, n, sign, scale) {
  if (re.length !== n * n || im.length !== n * n) throw new Error('fourier reference: array length must be N².');
  const outRe = new Float64Array(n * n), outIm = new Float64Array(n * n);
  for (let z = 0; z < n; z++) {
    for (let x = 0; x < n; x++) {
      let sumRe = 0, sumIm = 0;
      for (let q = 0; q < n; q++) {
        for (let p = 0; p < n; p++) {
          const angle = sign * 2 * Math.PI * (((p * x + q * z) % n) / n);
          const c = Math.cos(angle), s = Math.sin(angle), i = q * n + p;
          sumRe += re[i] * c - im[i] * s;
          sumIm += re[i] * s + im[i] * c;
        }
      }
      outRe[z * n + x] = sumRe * scale;
      outIm[z * n + x] = sumIm * scale;
    }
  }
  return { re: outRe, im: outIm };
}

/** Σ_k H[k]·e^{+ik·x}: the spectrum model's amplitude convention. */
export function synthesize2d(re, im, n) {
  return transform(re, im, n, 1, 1);
}

/** Standard inverse DFT, 1/N² applied once. */
export function inverseDft2d(re, im, n) {
  return transform(re, im, n, 1, 1 / (n * n));
}

export function forwardDft2d(re, im, n) {
  return transform(re, im, n, -1, 1);
}
