import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettlementTable } from '../src/components/SettlementTable.jsx';
import { BudgetComparison } from '../src/components/BudgetComparison.jsx';
import { SettlementDetails } from '../src/components/SettlementDetails.jsx';
import { EMPTY_FILTERS } from '../src/shell/ExplorerPanel.jsx';
import { matchesFilters } from '../src/components/WorldMap.jsx';
import { classes, mockApi } from './helpers.js';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const row = (sourceId, name, extra = {}) => ({
  id: `settlement:azgaar-burg:${sourceId}`, sourceId, name, stateId: 'region:azgaar-state:1', stateName: 'Alpha', cultureId: 'culture:azgaar:1',
  cultureName: 'Folk', population: 4000, class: 'town', capital: false, port: false, npcs: 20, pilot: false, ...extra,
});

describe('SettlementTable', () => {
  it('sends filters and sort to the API and selects a clicked row', async () => {
    const calls = mockApi({ '/api/world/settlements': { data: [row(3, 'Vhaltha', { pilot: true, capital: true })], meta: { page: { page: 1, pageSize: 50, totalItems: 1, totalPages: 1 } } } });
    const onSelect = vi.fn();
    render(<SettlementTable filters={{ ...EMPTY_FILTERS, class: 'town', q: 'vh' }} classes={classes} selectedId={null} onSelect={onSelect} />);
    await screen.findByText('Vhaltha');
    expect(calls.at(-1)).toContain('class=town');
    expect(calls.at(-1)).toContain('q=vh');
    expect(calls.at(-1)).toContain('sort=population&order=desc');
    expect(screen.getByText('1 settlements match')).toBeTruthy();
    expect(screen.getByText('pilot')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Settlement/ }));
    await waitFor(() => expect(calls.at(-1)).toContain('sort=name&order=asc'));

    fireEvent.click(screen.getByText('Vhaltha'));
    expect(onSelect).toHaveBeenCalledWith('settlement:azgaar-burg:3');
  });

  it('shows an empty state and an API error', async () => {
    mockApi({ '/api/world/settlements': { data: [], meta: { page: { page: 1, pageSize: 50, totalItems: 0, totalPages: 1 } } } });
    render(<SettlementTable filters={EMPTY_FILTERS} classes={classes} onSelect={() => {}} />);
    await screen.findByText('No settlements match these filters.');
    cleanup();
    mockApi({ '/api/world/settlements': { status: 400, error: { code: 'invalid_parameter', message: 'maxPopulation must be an integer' } } });
    render(<SettlementTable filters={{ ...EMPTY_FILTERS, maxPopulation: 'x' }} classes={classes} onSelect={() => {}} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('invalid_parameter');
    expect(alert.textContent).toContain('maxPopulation must be an integer');
  });
});

describe('BudgetComparison', () => {
  const scenario = (target, allocated, feasible, reason = null) => ({
    target, allocated, feasible, reason, minimumTotal: 8571, maximumTotal: 17204, coverage: 1, settlementsAtMaximum: 0, settlementsAtMinimum: 0,
    byClass: [{ key: 'town', npcs: allocated, settlements: 10 }], byState: [{ key: 'Alpha', npcs: allocated, settlements: 10, population: 100000 }],
  });
  it('separates configured targets from computed allocations and flags infeasible ones', async () => {
    mockApi({ '/api/world/npc-budget': {
      configuredTarget: 10040,
      ranges: Object.fromEntries(classes.map((c) => [c.id, { min: 1, max: 2 }])),
      importance: { capital: 1.5, port: 1.15, marketCenter: 1.25 },
      scenarios: [scenario(5000, 8571, false, 'Target 5000 is below the 8571 NPCs that class minimums require'), scenario(10040, 10040, true), scenario(20000, 17204, false, 'exceeds')],
    } });
    render(<BudgetComparison classes={classes} />);
    await screen.findByText('Persistent NPC budget');
    expect(screen.getAllByText('infeasible')).toHaveLength(2);
    expect(screen.getByText('feasible')).toBeTruthy();
    expect(screen.getByText('configured')).toBeTruthy();
    expect(screen.getByText(/below the 8571 NPCs/)).toBeTruthy();
    expect(screen.getByText('By state · target 10,040')).toBeTruthy();
    fireEvent.click(screen.getByText(/below the 8571/).closest('button'));
    expect(screen.getByText('By state · target 5,000')).toBeTruthy();
  });
});

describe('SettlementDetails', () => {
  const detail = {
    ...row(238, 'Vhaltha', { pilot: true }), populationPoints: 15.747, provinceName: 'Deep', x: 10, y: 20, cell: 5, azgaarType: 'Generic', azgaarGroup: 'cities',
    civicFeatures: ['walls', 'plaza'], geography: { biome: 'Taiga', heightIndex: 30, coastal: false, riverCell: true },
    economy: { extractedGoods: [], craftedGoods: [{ name: 'Tools' }], marketCenter: true, marketId: 15 },
    npcAllocation: { min: 35, max: 70 },
    connectivity: { roadConnected: true, onLandRoute: true, roadComponentId: 'road-1', distanceUnit: 'mi', distanceScale: 3,
      roadLinks: [{ settlementId: 'settlement:azgaar-burg:60', name: 'Sshanderi', routeId: 7, group: 'trails', lengthPx: 10 }], seaLinks: [],
      nearby: [{ settlementId: 'settlement:azgaar-burg:61', name: 'Near', distance: 12, sameRoadComponent: false }] },
  };

  it('shows source facts, computed values and connectivity for the selected settlement', async () => {
    mockApi({ '/api/world/settlements/': detail });
    const onSelect = vi.fn();
    render(<SettlementDetails id="settlement:azgaar-burg:238" classes={classes} onSelect={onSelect} />);
    await screen.findByText('Vhaltha');
    expect(screen.getByText('walls, plaza')).toBeTruthy();
    expect(screen.getByText('Yes (market 15)')).toBeTruthy();
    expect(screen.getAllByText('calc').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('tab', { name: 'Connectivity' }));
    expect(screen.getByText('On road network road-1')).toBeTruthy();
    expect(screen.getByText(/30 mi by route/)).toBeTruthy();
    expect(screen.getByText(/not road-linked/)).toBeTruthy();
    fireEvent.click(screen.getByText('Sshanderi'));
    expect(onSelect).toHaveBeenCalledWith('settlement:azgaar-burg:60');
  });

  it('shows a retryable error for a missing settlement', async () => {
    const calls = mockApi({ '/api/world/settlements/': { status: 404, error: { code: 'not_found', message: 'No settlement 99999' } } });
    render(<SettlementDetails id="99999" classes={classes} />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No settlement 99999');
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(calls).toHaveLength(2));
  });
});

describe('map filters', () => {
  it('match markers the same way the table filters do', () => {
    const m = { name: 'Vhaltha', class: 'city', stateId: 's1', cultureId: 'c1', capital: false, population: 15747 };
    expect(matchesFilters(m, EMPTY_FILTERS)).toBe(true);
    expect(matchesFilters(m, { ...EMPTY_FILTERS, q: 'VHA', class: 'city', minPopulation: '15000' })).toBe(true);
    expect(matchesFilters(m, { ...EMPTY_FILTERS, capital: 'true' })).toBe(false);
    expect(matchesFilters(m, { ...EMPTY_FILTERS, maxPopulation: '1000' })).toBe(false);
  });
});
