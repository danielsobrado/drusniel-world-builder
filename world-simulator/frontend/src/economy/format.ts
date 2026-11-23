import type { CalendarDate } from '../api/types';

export const RATIONS = 'Rations';

/** Quantities: whole numbers for rations, two decimals for Azgaar goods. */
export const qty = (good: string, units: number) =>
  good === RATIONS ? Math.round(units).toLocaleString('en-US') : units.toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Rations are priced per 1,000; Azgaar goods per unit. */
export const price = (good: string, value: number) => (good === RATIONS ? (value * 1000).toFixed(2) : value.toFixed(2));

export const cargoText = (cargo: Record<string, number>) =>
  Object.entries(cargo).map(([g, u]) => `${g} ${qty(g, u)}`).join(', ');

/** Scenario day to a calendar label, reckoned from a known date of the same scenario. */
export function dayLabel(day: number, ref: CalendarDate, cal = { daysPerMonth: 30, monthsPerYear: 12 }) {
  const perYear = cal.daysPerMonth * cal.monthsPerYear;
  const startYear = ref.year - Math.floor(ref.day / perYear);
  const year = startYear + Math.floor(day / perYear);
  const month = Math.floor((day % perYear) / cal.daysPerMonth) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String((day % cal.daysPerMonth) + 1).padStart(2, '0')}`;
}
