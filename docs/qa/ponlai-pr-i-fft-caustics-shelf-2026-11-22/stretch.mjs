import sharp from 'sharp';
const [dir, pose, left = 300, top = 200, width = 1000, height = 450] = process.argv.slice(2);
const region = { left: +left, top: +top, width: +width, height: +height };
const tiles = await Promise.all(['web', 'fft', 'web-repeat'].map((v) => sharp(`${dir}/${pose}-${v}.png`).extract(region)
  .removeAlpha().toColourspace('b-w').linear(5, -5 * 38).png().toBuffer()));
await sharp({ create: { width: region.width, height: region.height * 3 + 20, channels: 3, background: '#f00' } })
  .composite(tiles.map((input, i) => ({ input, top: i * (region.height + 10), left: 0 }))).png().toFile(`${dir}/${pose}-stretch.png`);
