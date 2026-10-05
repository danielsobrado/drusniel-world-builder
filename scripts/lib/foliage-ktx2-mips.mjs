// Adapted from Gods' End vegetationKtx2Mips: ETC1S loses cutout alpha in
// the tiny tail of a mip pyramid. Ship the usable prefix and clamp to it.
export const KTX2_MIN_MIP_SIZE = 8;
export const FOLIAGE_KTX2_ALPHA_CUTOFF = 0.5;

export function ktx2MipChain(levels) {
  const usable = levels.filter(({ width, height }) => width >= KTX2_MIN_MIP_SIZE && height >= KTX2_MIN_MIP_SIZE);
  return usable.length >= 2 ? usable : levels.slice(0, 2);
}

export function sharpenCutoutAlpha({ data, width, height }, cutoff = FOLIAGE_KTX2_ALPHA_CUTOFF) {
  const alpha = new Uint8Array(data);
  const edge = cutoff * 255;
  for (let i = 3; i < alpha.length; i += 4) {
    alpha[i] = Math.max(0, Math.min(255, Math.round(edge + (alpha[i] - edge) * 6)));
  }
  return { data: alpha, width, height };
}
