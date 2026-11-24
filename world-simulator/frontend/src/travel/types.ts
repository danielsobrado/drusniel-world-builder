import type { Caravan } from '../api/types';

export type Point = [number, number];

export interface TravelPath {
  id: string;
  fromId: string;
  toId: string;
  mode: 'land' | 'sea' | 'mixed' | 'off-road';
  days: number;
  distance: number;
  unit: string;
  points: Point[];
  sourceRouteIds: number[];
}

export interface Journey {
  id: string;
  routeId: string;
  status: 'departing' | 'traveling' | 'delayed' | 'returning' | 'arrived' | 'returned';
  active: boolean;
  population: number;
  originId: string;
  destinationId: string;
  origin: string;
  destination: string;
  reason: string;
  departure: string;
  arrival: string;
  departDay: number;
  arriveDay: number;
  companions: { id: string; name: string }[];
  incidents: { kind: string; day: number; date: string; delayDays: number }[];
  news: string[];
}

export interface Convoy extends Caravan {
  carrierId: string | null;
  carrier: string | null;
  delayDays: number;
  delayReason: string | null;
  status: 'queued' | 'traveling' | 'delayed' | 'arrived';
  repositioning: boolean;
  departure: string;
  arrival: string;
  news: string[];
}

export interface TravelData {
  day: number;
  names: Record<string, string>;
  routes: TravelPath[];
  populationInTransit: number;
  journeys: Journey[];
  caravans: Convoy[];
  flows: { originId: string; destinationId: string; origin: string; destination: string; traveling: number; arrived: number; returned: number }[];
}

export type TravelDetail = ({ kind: 'journeys'; item: Journey }
  | { kind: 'caravans'; item: Convoy } | { kind: 'routes'; item: TravelPath })
  & { route: TravelPath | null; names: Record<string, string> };

export function label(value: string) {
  return value.replaceAll('-', ' ').replace(/^./, (first) => first.toUpperCase());
}
