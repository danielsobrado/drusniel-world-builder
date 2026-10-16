import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const root = new URL('../../../', import.meta.url);
const snapshot = JSON.parse(await readFile(new URL('source-snapshot.json', import.meta.url), 'utf8'));
const paths = [
  'src/editor/world/GrassPatchiness.js',
  'src/editor/stylized/meadow/meadowGrowthMath.js',
];
const sourceHashes = {};
for (const file of paths) {
  const hash = createHash('sha256').update(await readFile(new URL(file, root))).digest('hex');
  if (hash !== snapshot.sourceSnapshot.files[file]) throw new Error(`Source differs from capture: ${file}`);
  sourceHashes[file] = hash;
}
const { grassSparsity } = await import(new URL(paths[0], root));
const { meadowNoiseNumber } = await import(new URL(paths[1], root));
const patchBounds = [['savanna', .72], ['grassland', .92], ['deciduous forest', .85], ['taiga', .65], ['tundra', .28]]
  .map(([biome, density]) => ({ biome, density, minimumPatchCover: 1 - grassSparsity(density) }));
let short = 0, tall = 0, samples = 0;
for (let z = -30; z < 30; z += .067) for (let x = -30; x < 30; x += .071) {
  const noise = meadowNoiseNumber(x, z);
  short += noise <= .55;
  tall += noise >= .75;
  samples++;
}
const report = {
  kind: 'CPU mathematical probes; not rendered coverage or final blade-population measurements',
  sourceSha: snapshot.sourceSha,
  sourceHashes,
  patchBounds,
  heightNoise: {
    sampleDomain: 'noise-space x,z in [-30,30), increments .071 and .067 respectively',
    samples,
    shortPlateauFraction: short / samples,
    tallPlateauFraction: tall / samples,
    intermediateFraction: (samples - short - tall) / samples,
  },
};
await writeFile(new URL('diagnostics.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
