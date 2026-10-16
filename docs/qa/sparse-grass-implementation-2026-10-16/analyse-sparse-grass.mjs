// Numeric companions to the acceptance captures (acceptance-sparse-grass.mjs).
//   node analyse-sparse-grass.mjs flicker <framesDir> [first] [count] [step]
//     High-temporal-frequency energy per horizontal screen band: mean |f(t) - (f(t-1)+f(t+1))/2|
//     in luma. Smooth wind sway scores low; aliasing and shimmer, which flip frame to frame, score high.
//     Screencast cadence varies between runs: pass a fractional [step] to resample to a common rate.
//   node analyse-sparse-grass.mjs rows <image.png> [x0] [x1]
//     Mean luma per 20-pixel row band over a column window, to locate brightness steps.
import sharp from 'sharp';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

// Analysis width (env W, default 400); 1600 keeps single-pixel shimmer.
const W = Number(process.env.W ?? 400), H = Math.round(W * 9 / 16);
const luma = async file => {
  const { data } = await sharp(file).resize(W, H, { kernel: 'cubic' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = new Float32Array(W * H);
  for (let i = 0; i < out.length; i++) out[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  return out;
};
const [mode, target, a, b] = process.argv.slice(2);
if (mode === 'flicker') {
  const files = (await readdir(target)).filter(f => f.endsWith('.jpg')).sort();
  const first = Number(a ?? 0), count = Number(b ?? files.length - first), step = Number(process.argv[6] ?? 1);
  const frames = [];
  for (let i = first; i < Math.min(files.length, first + count); i += step) frames.push(await luma(path.join(target, files[Math.round(i)])));
  const bands = 9, sums = new Float64Array(bands), counts = new Float64Array(bands);
  for (let t = 1; t < frames.length - 1; t++) for (let y = 0; y < H; y++) {
    const band = Math.floor(y / H * bands);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      sums[band] += Math.abs(frames[t][i] - (frames[t - 1][i] + frames[t + 1][i]) / 2); counts[band]++;
    }
  }
  console.log(JSON.stringify({ frames: frames.length, bandsTopToBottom: [...sums].map((s, i) => +(s / counts[i]).toFixed(2)) }));
} else if (mode === 'rows') {
  const img = await luma(target), x0 = Math.floor(Number(a ?? 0.3) * W), x1 = Math.floor(Number(b ?? 0.7) * W);
  const rows = [];
  for (let y0 = 0; y0 < H; y0 += 5) {
    let s = 0, n = 0;
    for (let y = y0; y < y0 + 5; y++) for (let x = x0; x < x1; x++) { s += img[y * W + x]; n++; }
    rows.push(+(s / n).toFixed(1));
  }
  console.log(JSON.stringify(rows));
}
