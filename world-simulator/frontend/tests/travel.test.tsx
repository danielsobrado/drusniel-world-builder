import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JourneyDetails } from '../src/travel/TravelDetails';
import type { Journey } from '../src/travel/types';

describe('Journey inspector', () => {
  it('shows a delayed traveler’s destination, dates, companions, and incident', () => {
    const select = vi.fn();
    const item: Journey = {
      id: 'journey:1', routeId: 'travel:2:9', status: 'delayed', active: true, reason: 'Work and housing',
      originId: 'origin', destinationId: 'destination', origin: 'Sshanderi', destination: 'Vhaltha',
      departure: '1213-01-01', arrival: '1213-01-16', departDay: 360, arriveDay: 375, population: 3,
      news: ['event:12'], incidents: [{ kind: 'road-closure', day: 365, date: '1213-01-06', delayDays: 3 }],
      companions: [{ id: 'npc:2:1', name: 'Alya' }],
    };
    render(<JourneyDetails item={item} onSelect={select} />);
    expect(screen.getByText('Delayed')).toBeTruthy();
    expect(screen.getByText('1213-01-16')).toBeTruthy();
    expect(screen.getByText(/Road closure/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Alya' }));
    expect(select).toHaveBeenCalledWith('npc:2:1');
  });
});
