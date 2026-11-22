import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ScenarioState, ScenarioStatus } from '../src/api/types';
import type { Simulation } from '../src/simulation/useSimulation';
import { BusinessesWorkspace } from '../src/society/BusinessesWorkspace';
import { HouseholdsWorkspace } from '../src/society/HouseholdsWorkspace';
import { mockApi, society } from './helpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const date = { day: 30, year: 1212, month: 2, dayOfMonth: 1, label: '1212-02-01' };
const active = { id: 'baseline-pilot', name: 'Pilot baseline', running: false, readOnly: null, date } as unknown as ScenarioStatus;
const sim = { active, version: 'v1' } as unknown as Simulation;
const state: ScenarioState = {
  schemaVersion: 2, scenarioId: 'baseline-pilot', seed: 1212, startYear: 1212, date, history: [],
  settlements: [{ settlementId: 'settlement:azgaar-burg:238', sourceId: 238, name: 'Vhaltha', population: 48,
    cohorts: { children: 24, adults: 20, elders: 4 }, births: 0, deaths: 0, society: society() }],
};

describe('HouseholdsWorkspace', () => {
  it('shows household composition, housing occupancy and needs with their reasons', async () => {
    mockApi({ '/api/scenarios/baseline-pilot/state': state });
    render(<HouseholdsWorkspace sim={sim} onSelect={() => {}} />);
    await screen.findByText('Couple with children');
    expect(screen.getByText('Cottage')).toBeTruthy();
    expect(screen.getByText(/8 agriculture workers grow 26 of 48/)).toBeTruthy();
    expect(screen.getAllByText(/critical/).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText('Filter household and building types'), { target: { value: 'elder' } });
    expect(screen.queryByText('Couple with children')).toBeNull();
    expect(screen.getByText('Elder living alone')).toBeTruthy();
  });
});

describe('BusinessesWorkspace', () => {
  it('lists businesses from the paged API and selects one into the inspector', async () => {
    const calls = mockApi({
      '/api/scenarios/baseline-pilot/state': state,
      '/api/scenarios/baseline-pilot/businesses': {
        data: society().businesses, meta: { page: { page: 1, pageSize: 50, totalItems: 2, totalPages: 1 } },
      },
    });
    const onSelect = vi.fn();
    render(<BusinessesWorkspace sim={sim} onSelect={onSelect} selectedId={null} />);
    await screen.findByText('Vhaltha Tools workshop');
    expect(within(screen.getByRole('table', { name: 'Businesses' })).getByText('3 / 5')).toBeTruthy();
    expect(screen.getByText('Azgaar records crafting of Tools')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Sector'), { target: { value: 'crafts' } });
    await waitFor(() => expect(calls.at(-1)?.url).toContain('sector=crafts'));
    fireEvent.click(screen.getByText('Vhaltha Tools workshop'));
    expect(onSelect).toHaveBeenCalledWith('business:azgaar-burg:238:workshop-tools:1');
  });
});
