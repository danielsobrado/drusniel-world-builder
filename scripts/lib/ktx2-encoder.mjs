import { spawnSync } from 'node:child_process';

export const REQUIRED_KTX2_ENCODER_VERSION = 'toktx v4.4.2';

/** Validate before a bake replaces its published sources or derived files. */
export function requireKtx2Encoder(encoder) {
  const result = spawnSync(encoder, ['--version'], { encoding: 'utf8' });
  if (result.error) throw result.error;
  // toktx reports its version on stderr on Windows.
  const version = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  if (result.status !== 0 || version !== REQUIRED_KTX2_ENCODER_VERSION) {
    throw new Error(`Expected ${REQUIRED_KTX2_ENCODER_VERSION}, received ${version}.`);
  }
  return version;
}
