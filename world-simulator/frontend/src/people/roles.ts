import type { PersonRole, PersonRow } from '../api/types';

export const ROLE_LABEL: Record<PersonRole, string> = {
  child: 'Child', worker: 'Worker', unemployed: 'Without work', retired: 'Retired', trader: 'Caravan master',
  outlaw: 'Outlaw', imprisoned: 'Imprisoned',
};

export function occupation(p: PersonRow): string {
  if (p.role === 'worker') return `${p.profession} · ${p.workplace ?? ''}`;
  if (p.role === 'unemployed') return p.idleMonths ? `${p.idleMonths} months idle` : 'looking for work';
  if (p.role === 'outlaw') return 'on the road with the band';
  if (p.role === 'trader') return 'caravan master';
  return '—';
}
