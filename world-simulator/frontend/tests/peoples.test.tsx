import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PeoplesExplorer } from '../src/peoples/PeoplesExplorer';
import type { PeoplesData, PeoplesSelection } from '../src/peoples/types';

describe('Peoples & Cultures explorer', () => {
  it('offers ancestry, culture and institution selections with seed provenance', () => {
    const selected: PeoplesSelection[] = [];
    const data = {
      ancestries: { goblin: { label: 'Goblin' } },
      cultures: { 'goblin-peoples': { displayName: 'Goblin peoples', status: 'seed' } },
      profiles: { 'goblin-peoples': { institutions: [{ id: 'networks', label: 'Trade networks' }] } },
    } as unknown as PeoplesData;
    render(<PeoplesExplorer data={data} selection={null} onSelect={(choice) => selected.push(choice)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));
    fireEvent.click(screen.getByRole('button', { name: /Goblin peoples.*Seed/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Trade networks' }));
    expect(selected).toEqual([
      { type: 'ancestry', id: 'goblin' },
      { type: 'culture', id: 'goblin-peoples' },
      { type: 'institution', id: 'networks', cultureId: 'goblin-peoples' },
    ]);
  });
});
