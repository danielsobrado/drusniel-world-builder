import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor, act } from '@testing-library/react';
import type { ScenarioState, ScenarioStatus } from '../src/api/types';
import { SimulationControls } from '../src/simulation/SimulationControls';
import { SimulationWorkspace } from '../src/simulation/SimulationWorkspace';
import { useSimulation, type Simulation } from '../src/simulation/useSimulation';
import { mockApi, society } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const date = (day: number) => ({ day, year: 1212, month: 1 + Math.floor(day / 30), dayOfMonth: (day % 30) + 1, label: `1212-0${1 + Math.floor(day / 30)}-01` });
const status = (extra: Partial<ScenarioStatus> = {}): ScenarioStatus => ({
  id: 'baseline-pilot', name: 'Pilot baseline', description: '', scope: { type: 'pilot' }, seed: 1212, parent: null, createdAt: '',
  settlementIds: ['settlement:azgaar-burg:238'], date: date(0), running: false, speed: 0, population: 15747, checksum: 'abcd1234',
  snapshots: 0, error: null, snapshotSeq: 0, eventSeq: 1, readOnly: null, schemaVersion: 2, ...extra,
});
const state: ScenarioState = {
  schemaVersion: 1, scenarioId: 'baseline-pilot', seed: 1212, startYear: 1212, date: date(60),
  settlements: [{ settlementId: 'settlement:azgaar-burg:238', sourceId: 238, name: 'Vhaltha', population: 15760,
    cohorts: { children: 5200, adults: 8660, elders: 1900 }, births: 90, deaths: 77, society: society() }],
  history: [{ day: 0, population: { 'settlement:azgaar-burg:238': 15747 } }, { day: 30, population: { 'settlement:azgaar-burg:238': 15752 } },
    { day: 60, population: { 'settlement:azgaar-burg:238': 15760 } }],
};

function fakeSim(extra: Partial<Simulation> = {}): Simulation {
  return {
    config: { stepSizes: { day: 1, week: 7, month: 30, year: 360 }, speeds: [1, 7, 30, 120], startYear: 1212, scopeTypes: ['pilot'], limits: { maxScopeSettlements: 120 } },
    scenarios: [status()], active: status(), version: 'v1', busy: false, error: null,
    select: vi.fn(), step: vi.fn(async () => {}), run: vi.fn(async () => {}), pause: vi.fn(async () => {}),
    snapshot: vi.fn(async () => null), restore: vi.fn(async () => {}), create: vi.fn(async () => null), clearError: vi.fn(),
    ...extra,
  };
}

describe('SimulationControls', () => {
  it('steps, runs and disables stepping while running', () => {
    const sim = fakeSim();
    const { rerender } = render(<SimulationControls sim={sim} />);
    fireEvent.click(screen.getByRole('button', { name: '+Month' }));
    expect(sim.step).toHaveBeenCalledWith('month');
    fireEvent.click(screen.getByRole('button', { name: 'Run simulation' }));
    expect(sim.run).toHaveBeenCalledWith(1);

    const locked = fakeSim({ active: status({ readOnly: 'Saved against a different source map' }) });
    rerender(<SimulationControls sim={locked} />);
    expect(screen.getByText('read-only')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Run simulation' }) as HTMLButtonElement).disabled).toBe(true);

    const running = fakeSim({ active: status({ running: true, speed: 30 }) });
    rerender(<SimulationControls sim={running} />);
    expect((screen.getByRole('button', { name: '+Day' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Pause simulation' }));
    expect(running.pause).toHaveBeenCalled();
  });
});

describe('SimulationWorkspace', () => {
  it('shows settlement state, events and snapshots, and restores a snapshot', async () => {
    mockApi({
      '/api/scenarios/baseline-pilot/state': state,
      '/api/scenarios/baseline-pilot/events': [{ seq: 2, day: 60, date: '1212-03-01', kind: 'month', message: '1212-02 closed: 4 births' }],
      '/api/scenarios/baseline-pilot/snapshots': [{ id: 'snap-001', label: 'Spring', date: date(60), checksum: 'ffff0000', createdAt: '' }],
    });
    const sim = fakeSim();
    render(<SimulationWorkspace sim={sim} summary={null} onSelect={() => {}} />);
    await screen.findByRole('cell', { name: 'Vhaltha' });
    expect(screen.getByText('+13')).toBeTruthy();
    expect(screen.getByText(/1212-02 closed/)).toBeTruthy();
    expect(screen.getByRole('img', { name: /indexed to the scenario start/ })).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Restore' }));
    expect(sim.restore).toHaveBeenCalledWith('snap-001');
  });

  it('shows a write error from the backend', () => {
    const sim = fakeSim({ error: Object.assign(new Error('Pause the scenario before stepping it'), { code: 'running', status: 409 }) as never });
    mockApi({ '/api/scenarios/': { status: 500, error: { code: 'x', message: 'x' } } });
    render(<SimulationWorkspace sim={sim} summary={null} onSelect={() => {}} />);
    expect(screen.getAllByRole('alert')[0].textContent).toContain('Pause the scenario before stepping it');
  });
});

describe('useSimulation', () => {
  it('posts JSON writes and refreshes the scenario list', async () => {
    let day = 0;
    const calls = mockApi({
      '/api/simulation': fakeSim().config,
      '/api/scenarios/baseline-pilot/step': () => { day = 30; return status({ date: date(30) }); },
      '/api/scenarios': () => [status({ date: date(day) })],
    });
    const { result } = renderHook(() => useSimulation());
    await waitFor(() => expect(result.current.active?.id).toBe('baseline-pilot'));
    await act(() => result.current.step('month'));
    const post = calls.find((c) => c.url.endsWith('/step'))!;
    expect(post.init?.method).toBe('POST');
    expect(JSON.parse(String(post.init?.body))).toEqual({ unit: 'month' });
    expect(new Headers(post.init?.headers).get('content-type')).toBe('application/json');
    await waitFor(() => expect(result.current.active?.date.day).toBe(30));
  });
});

describe('useSimulation versioning', () => {
  it('changes the refetch version when only an event happens (e.g. a snapshot)', async () => {
    let seq = 1;
    mockApi({
      '/api/simulation': fakeSim().config,
      '/api/scenarios/baseline-pilot/snapshots': () => { seq = 2; return { id: 'snap-001' }; },
      '/api/scenarios': () => [status({ eventSeq: seq })],
    });
    const { result } = renderHook(() => useSimulation());
    await waitFor(() => expect(result.current.active).not.toBeNull());
    const before = result.current.version;
    await act(() => result.current.snapshot('x'));
    await waitFor(() => expect(result.current.version).not.toBe(before));
  });
});
