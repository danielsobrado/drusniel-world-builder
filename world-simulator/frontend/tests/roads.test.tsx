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
  it('shows personality, household, purse, investments and the caravans the trader led', async () => {
    const trader = { ...economyView.traders[0], route: economyView.routes[0], caravans: economyView.caravans,
      businesses: [{ id: 'business:azgaar-burg:113:farm:o1', name: 'Falanenerwin Farm (new 1)', filled: 8, staff: 8 }] };
    mockApi({ '/api/scenarios/baseline-pilot/traders/': trader });
    render(<TraderDetails id="npc:trader:1" sim={sim} onSelect={() => {}} />);
    await screen.findByText('Hamarlynnth');
    expect(screen.getByText('Falanenerwin → Vhaltha, 7 days')).toBeTruthy();
    expect(screen.getAllByText('0.98').length).toBe(2);
    expect(screen.getByText('2 adults, 3 children')).toBeTruthy();
    expect(screen.getByText('81.5')).toBeTruthy();
    expect(screen.getByText('64.0 · 6.0')).toBeTruthy();
    expect(screen.getByText('Falanenerwin Farm (new 1)')).toBeTruthy();
    expect(screen.getByText(/raided: lost Grain 1/)).toBeTruthy();
  });
});

describe('Unemployment views', () => {
  it('charts the unemployment rate and shows where the idle go', async () => {
    const { IdleTable, UnemploymentTrend } = await import('../src/society/UnemploymentView');
    const { society } = await import('./helpers');
    const id = 'settlement:azgaar-burg:113';
    const state = {
      schemaVersion: 4, scenarioId: 'x', seed: 1, startYear: 1212, date,
      history: [{ day: 0, population: { [id]: 100 } }, { day: 30, population: { [id]: 100 }, labour: { [id]: 50 }, unemployed: { [id]: 5 } },
        { day: 60, population: { [id]: 100 }, labour: { [id]: 50 }, unemployed: { [id]: 10 } }],
      settlements: [{ settlementId: id, sourceId: 113, name: 'Falanenerwin', population: 100, cohorts: { children: 30, adults: 50, elders: 20 },
        births: 0, deaths: 0, society: society(), economy: economyView.settlements[0].economy }],
      trade: { routes: economyView.routes, traders: economyView.traders },
    };
    render(<><UnemploymentTrend state={state} /><IdleTable state={state} /></>);
    expect(screen.getByRole('img', { name: 'Share of the labour force without work' })).toBeTruthy();
    const row = within(screen.getByRole('table', { name: 'Where the idle go' })).getAllByRole('row')[1];
    expect(row.textContent).toContain('Falanenerwin');
    expect(row.lastChild?.textContent).toBe('12');
  });
});
