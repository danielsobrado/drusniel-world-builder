/** Workspaces implemented so far; later PRs append here and keep these. Keys 1–n switch. */
export interface Workspace { id: string; label: string; icon: string }

export const WORKSPACES: readonly Workspace[] = Object.freeze([
  { id: 'overview', label: 'World overview', icon: 'overview' },
  { id: 'atlas', label: 'Atlas', icon: 'atlas' },
  { id: 'settlements', label: 'Settlements', icon: 'settlements' },
  { id: 'budget', label: 'NPC budget', icon: 'budget' },
  { id: 'pilot', label: 'Pilot', icon: 'pilot' },
  { id: 'simulation', label: 'Simulation', icon: 'clock' },
  { id: 'households', label: 'Households & Buildings', icon: 'home' },
  { id: 'businesses', label: 'Businesses & Employment', icon: 'briefcase' },
  { id: 'economy', label: 'Economy & Trade', icon: 'cart' },
  { id: 'roads', label: 'Roads & Traders', icon: 'shield' },
  { id: 'travel', label: 'Travel & Migration', icon: 'travel' },
  { id: 'people', label: 'People', icon: 'person' },
  { id: 'dialogue', label: 'Dialogue Lab', icon: 'chat' },
  { id: 'peoples', label: 'Peoples & Cultures', icon: 'person' },
  { id: 'lab', label: 'Validation Lab', icon: 'flask' },
]);
