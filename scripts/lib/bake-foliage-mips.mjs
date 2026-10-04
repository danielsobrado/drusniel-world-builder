import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import sharp from 'sharp';
import { foliageMipmaps } from '../../src/editor/stylized/impostor/alphaCoverage.js';

export async function bakeFoliageMips(directory = path.resolve('public/assets/impostors/trees')) {
  const manifestPath = path.join(directory, 'manifest.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const prototype of manifest.prototypes) {
    const filename = path.basename(prototype.albedo);
    const { data, info } = await sharp(path.join(directory, filename)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const levels = foliageMipmaps(data, info.width, info.height, 0.5);
    const header = Buffer.alloc(16);
    header.writeUInt32LE(0x50494d46, 0);
    header.writeUInt32LE(info.width, 4); header.writeUInt32LE(info.height, 8); header.writeUInt32LE(levels.length, 12);
    // Store bottom-to-top rows: Three r186's DataTexture flip path only flips
    // mip zero, so every level must already have the PNG upload orientation.
    const orientedLevels = levels.map(level => {
      const oriented = Buffer.alloc(level.data.length), rowBytes = level.width * 4;
      for (let y = 0; y < level.height; y++) {
        oriented.set(level.data.subarray(y * rowBytes, (y + 1) * rowBytes), (level.height - 1 - y) * rowBytes);
      }
      return oriented;
    });
    const mipName = filename.replace(/\.png$/, '-mips.bin.gz');
    await writeFile(path.join(directory, mipName), gzipSync(Buffer.concat([header, ...orientedLevels]), { level: 9 }));
    prototype.albedoMips = prototype.albedo.replace(filename, mipName);
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest.prototypes.length;
}
