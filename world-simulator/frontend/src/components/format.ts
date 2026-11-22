import type { SettlementClass } from '../api/types';

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const pct = (n: number) => `${(n * 100).toFixed(1)}%`;
export const shortHash = (fingerprint?: string | null) => fingerprint?.replace(/^sha256:/, '').slice(0, 10) ?? '—';

/** Class id to label, from the summary's configured classes. */
export function classLabel(classes: SettlementClass[] | undefined, id: string) {
  return classes?.find((c) => c.id === id)?.label ?? id;
}
