import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ScenarioStatus, SimEvent } from '../src/api/types';
import { RoadsWorkspace } from '../src/roads/RoadsWorkspace';
import { TraderDetails } from '../src/roads/TraderDetails';
import type { Simulation } from '../src/simulation/useSimulation';
import { date, economyView } from './economyFixture';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
const events: SimEvent[] = [
  { seq: 9, day: 60, date: '1212-03-01', kind: 'smuggling', message: 'Keladren of Falanenerwin was caught smuggling at Vhaltha' },
  { seq: 8, day: 60, date: '1212-03-01', kind: 'month', message: '1212-02 closed' },
];

describe('RoadsWorkspace', () => {
  it('shows the bandit bands, trader scorecards and incidents, and selects a trader', async () => {
    mockApi({ '/api/scenarios/baseline-pilot/economy': economyView, '/api/scenarios/baseline-pilot/events': events });
    const onSelect = vi.fn();
    render(<RoadsWorkspace sim={sim} onSelect={onSelect} selectedId={null} />);
    const roads = await screen.findByRole('table', { name: 'Roads' });
    expect(within(roads).getByText('Falanenerwin → Vhaltha')).toBeTruthy();
    expect(within(roads).getByText('15.5%')).toBeTruthy();
    expect(within(roads).getByText('the idle of both towns')).toBeTruthy();

    const cards = screen.getByRole('table', { name: 'Trader scorecards' });
    const rows = within(cards).getAllByRole('row');
    expect(rows[1].textContent).toContain('Hamarlynnth');
    expect(rows[1].textContent).toContain('92 · trusted');
    expect(rows[2].textContent).toContain('dismissed');
    expect(rows[2].textContent).toContain('11 · disgraced');
    fireEvent.click(rows[2]);
    expect(onSelect).toHaveBeenCalledWith('npc:trader:2');

    expect(await screen.findByText(/caught smuggling at Vhaltha/)).toBeTruthy();
    expect(screen.queryByText('1212-02 closed'), 'month closes are not incidents').toBeNull();
  });
});

describe('TraderDetails', () => {
  it('shows personality, the scorecard and the caravans the trader led', async () => {
    const trader = { ...economyView.traders[1], route: economyView.routes[0], caravans: economyView.caravans };
    mockApi({ '/api/scenarios/baseline-pilot/traders/': trader });
    render(<TraderDetails id="npc:trader:2" sim={sim} onSelect={() => {}} />);
    await screen.findByText('Keladren');
    expect(screen.getByText('Falanenerwin → Vhaltha, 7 days')).toBeTruthy();
    expect(screen.getByText('0.03')).toBeTruthy();
    expect(screen.getByText('3 times · fined 90.0')).toBeTruthy();
    expect(screen.getByText(/raided: lost Grain 1/)).toBeTruthy();
  });
});
