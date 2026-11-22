export const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const pct = (n) => `${(n * 100).toFixed(1)}%`;
export const shortHash = (fingerprint) => fingerprint?.replace(/^sha256:/, '').slice(0, 10) ?? '—';

/** Class id to label, from the summary's configured classes. */
export function classLabel(classes, id) {
  return classes?.find((c) => c.id === id)?.label ?? id;
}
