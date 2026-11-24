import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ScenarioStatus } from '../src/api/types';
import { EconomyWorkspace } from '../src/economy/EconomyWorkspace';
import { dayLabel } from '../src/economy/format';
import type { Simulation } from '../src/simulation/useSimulation';
import { economyView as view } from './economyFixture';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const date = { day: 60, year: 1212, month: 3, dayOfMonth: 1, label: '1212-03-01' };
const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
describe('EconomyWorkspace', () => {
  it('shows a broken supply chain, the market prices and the caravans on the road', async () => {
    const calls = mockApi({ '/api/scenarios/baseline-pilot/economy': view });
    render(<EconomyWorkspace sim={sim} onSelect={() => {}} />);
    const production = await screen.findByRole('table', { name: 'Production' });
    expect(within(production).getByText('no Hemp')).toBeTruthy();
    expect(within(production).getByText('full output')).toBeTruthy();
    expect(screen.getByText('short: 0 of 6')).toBeTruthy();
    expect(screen.getByText(/44,619 rural inhabitants/)).toBeTruthy();
    expect(screen.getByText('Growing conditions')).toBeTruthy();
    expect(screen.getByText('Granary loss')).toBeTruthy();
    expect(screen.getByText('Food affordability')).toBeTruthy();
    expect(screen.getByText('Housing arrears')).toBeTruthy();
    const finances = screen.getByRole('table', { name: 'Household financial tiers' });
    expect(within(finances).getByText('vulnerable')).toBeTruthy();

    const market = screen.getByRole('table', { name: 'Vhaltha market goods' });
    expect(within(market).getByText('+300%')).toBeTruthy();
    expect(within(market).getByText('0.60 /1,000'), 'rations are priced per thousand').toBeTruthy();
    const hemp = within(market).getByLabelText('Chart Hemp') as HTMLInputElement;
    expect(hemp.checked).toBe(true);
    fireEvent.click(hemp.closest('tr')!);
    expect(hemp.checked).toBe(false);

    const road = screen.getByRole('table', { name: 'Caravans on the road' });
    expect(within(road).getByText('Vhaltha → Falanenerwin')).toBeTruthy();
    expect(within(road).getByText(/in 7 days/)).toBeTruthy();
    expect(screen.getByText('No caravan has arrived yet.')).toBeTruthy();
    expect(calls[0].url).toContain('/economy?delivered=30');
  });

  it('turns scenario days into calendar dates', () => {
    expect(dayLabel(67, date)).toBe('1212-03-08');
    expect(dayLabel(360, date)).toBe('1213-01-01');
  });
});
