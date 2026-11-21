import sharp from 'sharp';
const dir = process.argv[2];
const load = async (n) => (await sharp(`${dir}/${n}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true }));
for (const pose of ['offshore-bed', 'shelf-toe']) {
  const [a, b, c] = await Promise.all(['web', 'fft', 'web-repeat'].map((v) => load(`${pose}-${v}`)));
  const stats = (x, y, rows = [0, 1]) => { let sum = 0, n = 0; const h = x.info.height, w = x.info.width;
    for (let j = Math.floor(rows[0] * h); j < rows[1] * h; j++) for (let i = 0; i < w; i++) { const k = 3 * (j * w + i); for (let ch = 0; ch < 3; ch++) { sum += Math.abs(x.data[k + ch] - y.data[k + ch]); n++; } } return (sum / n).toFixed(3); };
  const mean = (x, rows) => { let s = 0, n = 0; const h = x.info.height, w = x.info.width; for (let j = Math.floor(rows[0] * h); j < rows[1] * h; j++) for (let i = 0; i < w * 3; i++) { s += x.data[j * w * 3 + i]; n++; } return (s / n).toFixed(2); };
  console.log(pose, 'full A/A', stats(a, c), 'A/B', stats(a, b), '| lower third A/A', stats(a, c, [0.67, 1]), 'A/B', stats(a, b, [0.67, 1]), '| lower-third mean', mean(a, [0.67, 1]), mean(b, [0.67, 1]), mean(c, [0.67, 1]));
}
