import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { validateImpostorKtx2 } from '../scripts/lib/impostor-ktx2-validation.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const bytes = Buffer.alloc(131);
  Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes);
  bytes.writeUInt32LE(32, 20); bytes.writeUInt32LE(16, 24); bytes.writeUInt32LE(1, 36);
  bytes.writeUInt32LE(2, 40); bytes.writeUInt32LE(1, 44);
  for (let i = 0; i < 2; i++) { bytes.writeBigUInt64LE(BigInt(128 + i), 80 + i * 24); bytes.writeBigUInt64LE(1n, 88 + i * 24); }
  const source = Buffer.from('source');
  const prototype = { columns: 2, rows: 1, tileSize: 16,
    albedoKtx2Metadata: { encoder: 'toktx v4.4.2', sourceSha256: hash(source), sha256: hash(bytes), width: 32, height: 16, levels: 2, alphaCutoff: 0.5 } };
  return { bytes, source, prototype };
}
test('compressed foliage validation rejects stale sources and corrupted payloads', () => {
  const { bytes, source, prototype } = fixture();
  assert.deepEqual(validateImpostorKtx2(bytes, source, prototype), { width: 32, height: 16, levels: 2, bytes: 131 });
  assert.throws(() => validateImpostorKtx2(bytes, Buffer.from('changed'), prototype), /provenance/);
  bytes[130] = 1; assert.throws(() => validateImpostorKtx2(bytes, source, prototype), /provenance/);
});
test('compressed foliage validation rejects out-of-bounds mips even with matching hashes', () => {
  const { bytes, source, prototype } = fixture();
  bytes.writeBigUInt64LE(99999n, 80); prototype.albedoKtx2Metadata.sha256 = hash(bytes);
  assert.throws(() => validateImpostorKtx2(bytes, source, prototype), /payload/);
});
