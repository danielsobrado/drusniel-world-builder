import { createHash } from 'node:crypto';
import { REQUIRED_KTX2_ENCODER_VERSION } from './ktx2-encoder.mjs';

const SIGNATURE = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

/** Validate published payload and its source/settings provenance before release. */
export function validateImpostorKtx2(bytes, source, prototype) {
  const metadata = prototype.albedoKtx2Metadata;
  if (bytes.length < 80 || !bytes.subarray(0, 12).equals(SIGNATURE)) throw new Error('Invalid foliage KTX2 header.');
  const width = bytes.readUInt32LE(20), height = bytes.readUInt32LE(24), levels = bytes.readUInt32LE(40);
  if (!metadata || metadata.encoder !== REQUIRED_KTX2_ENCODER_VERSION || metadata.alphaCutoff !== 0.5
    || metadata.sourceSha256 !== hash(source) || metadata.sha256 !== hash(bytes)) throw new Error('Stale foliage KTX2 provenance.');
  if (width !== prototype.columns * prototype.tileSize || height !== prototype.rows * prototype.tileSize
    || width !== metadata.width || height !== metadata.height || levels !== metadata.levels || levels < 2
    || Math.min(width, height) / 2 ** (levels - 1) < 8) throw new Error('Invalid foliage KTX2 mip dimensions.');
  if (bytes.readUInt32LE(28) || bytes.readUInt32LE(32) || bytes.readUInt32LE(36) !== 1
    || bytes.readUInt32LE(44) !== 1) throw new Error('Expected a 2D ETC1S foliage KTX2.');
  for (let i = 0; i < levels; i++) {
    const index = 80 + i * 24;
    if (index + 24 > bytes.length) throw new Error('Truncated foliage KTX2 level index.');
    const offset = Number(bytes.readBigUInt64LE(index)), size = Number(bytes.readBigUInt64LE(index + 8));
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || size < 1 || offset < 80 + levels * 24
      || offset + size > bytes.length) throw new Error('Invalid foliage KTX2 level payload.');
  }
  return { width, height, levels, bytes: bytes.length };
}
