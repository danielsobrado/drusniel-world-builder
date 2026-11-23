import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { HistoryEventView, ScenarioStatus } from '../src/api/types';
import { ChecksPanel } from '../src/lab/ChecksPanel';
import { InterventionPanel } from '../src/lab/InterventionPanel';
import { TracePanel } from '../src/lab/TracePanel';
import type { Simulation } from '../src/simulation/useSimulation';
import { date } from './economyFixture';
import { mockApi } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const base = '/api/scenarios/baseline-pilot';
const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date, replayable: true } as unknown as ScenarioStatus;

const event = (id: string, summary: string, depth: number, extra: Partial<HistoryEventView> = {}) => ({
  id, seq: Number(id.split(':')[1]), day: 30, date: '1212-02-01', datePrecision: 'day', kind: 'lost-work', category: 'career',
  source: 'simulation', settlementId: null, locationId: null, routeId: null, businessId: null, caravanId: null, householdId: null,
  participants: [], relatedEntities: [], facts: {}, causedBy: [], effects: [], importance: 3, visibility: 'household', summary, depth, ...extra,
});

describe('Validation Lab', () => {
  it('applies a disaster to the chosen business and reports what was recorded', async () => {
    mockApi({
      [`${base}/interventions/targets`]: {
        settlements: [{ id: 's:1', name: 'Vhaltha', granary: 900 }],
        businesses: [{ id: 'b:tavern', name: 'Vhaltha Tavern', kind: 'tavern', good: null, settlement: 'Vhaltha', filled: 4, named: 0 },
          { id: 'b:mine', name: 'Vhaltha Mine', kind: 'mine', good: 'Iron', settlement: 'Vhaltha', filled: 30, named: 3 }],
        routes: [{ id: 'r:1', name: 'Vhaltha – Sshanderi', mode: 'land', bandits: 2 }],
      },
    });
    const recorded = [event('event:90', 'Vhaltha Mine collapsed', 0, { kind: 'disaster', source: 'intervention' })];
    const intervene = vi.fn(async () => recorded as unknown as HistoryEventView[]);
    const onRecorded = vi.fn();
    render(<InterventionPanel sim={{ active, version: 'v1', busy: false, intervene } as unknown as Simulation} onRecorded={onRecorded} />);
    const target = await screen.findByRole('combobox', { name: 'Target' });
    expect((target as HTMLSelectElement).value).toBe('b:mine');      // the business with most named workers comes first
    fireEvent.change(screen.getByRole('combobox', { name: 'Cause' }), { target: { value: 'fire' } });
    fireEvent.click(screen.getByRole('button', { name: /Apply on/ }));
    await waitFor(() => expect(intervene).toHaveBeenCalledWith({ kind: 'disaster', businessId: 'b:mine', cause: 'fire', note: '' }));
    expect(onRecorded).toHaveBeenCalledWith(recorded);
  });

  it('replays the scenario and lists the consistency checks', async () => {
    mockApi({
      [`${base}/validation`]: { passed: false, replayable: true, seconds: 0.2, date: '1212-03-01', checks: [
        { id: 'people', label: 'Named people fit each town’s budget', passed: true, checked: 120, problems: [], problemCount: 0 },
        { id: 'history', label: 'Every event names what exists', passed: false, checked: 500, problems: ['event:3: unknown route r:9'], problemCount: 1 },
      ] },
      [`${base}/replay`]: { replayable: true, matches: true, seconds: 1.4, commands: 3, date: '1212-03-01',
        state: { live: 'sha256:aaaa1111', replayed: 'sha256:aaaa1111', matches: true },
        history: { live: 'sha256:b', replayed: 'sha256:b', liveCount: 812, replayedCount: 812, matches: true } },
    });
    render(<ChecksPanel sim={{ active, version: 'v1' } as unknown as Simulation} />);
    const checks = await screen.findByRole('table', { name: 'Consistency checks' });
    expect(within(checks).getByText('1 problem(s)')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Replay from the baseline' }));
    expect(await screen.findByText('Identical')).toBeTruthy();
    expect(screen.getByText(/812 events · replayed 812/)).toBeTruthy();
  });

  it('shows the causal chain by steps away and re-centres on a clicked event', async () => {
    mockApi({
      [`${base}/history/events/`]: { root: 'event:90', edges: [['event:90', 'event:91']], nodes: [
        event('event:90', 'Vhaltha Mine collapsed', 0, { kind: 'disaster', source: 'intervention' }),
        event('event:91', 'Orrin Vale: Lost work: Vhaltha Mine collapsed', 1, { participants: [{ personId: 'npc:1:4', role: 'subject', name: 'Orrin Vale' }] }),
      ] },
    });
    const onEvent = vi.fn();
    const onSelect = vi.fn();
    render(<TracePanel sim={{ active, version: 'v1' } as unknown as Simulation} eventId="event:90" onEvent={onEvent} onSelect={onSelect} />);
    const trace = await screen.findByRole('list', { name: 'Causal trace' });
    expect(within(trace).getByText('this event')).toBeTruthy();
    expect(within(trace).getByText('1 on')).toBeTruthy();
    fireEvent.click(within(trace).getByText(/Lost work/));
    expect(onEvent).toHaveBeenCalledWith('event:91');
    fireEvent.click(within(trace).getByText('Orrin Vale'));
    expect(onSelect).toHaveBeenCalledWith('npc:1:4');
  });
});
