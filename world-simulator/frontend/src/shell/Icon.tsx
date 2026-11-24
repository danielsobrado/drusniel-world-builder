// Stroke icons on a 24px grid, drawn to share one weight and style.
const PATHS: Record<string, string> = {
  overview: 'M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z',
  atlas: 'M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  settlements: 'M3 20h18M5 20V10l4-3 4 3v10M13 20v-6h6v6M8 13h2M8 16h2',
  budget: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM2 20c0-3.3 2.7-6 6-6s6 2.7 6 6M17 11a2.5 2.5 0 1 0 0-5M18 14c2.4.6 4 2.9 4 6',
  pilot: 'M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z',
  panelLeft: 'M4 4h16v16H4zM9 4v16',
  panelRight: 'M4 4h16v16H4zM15 4v16',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5',
  chevron: 'M9 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  reset: 'M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  home: 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10',
  briefcase: 'M3 8h18v12H3zM8 8V5h8v3M3 13h18',
  cart: 'M2 6h12v9H2zM14 9h4l4 4v2h-8M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  travel: 'M7 4a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM17 14a3 3 0 1 0 0 6 3 3 0 1 0 0-6zM7 10v4a3 3 0 0 0 3 3h4',
  person: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4.4 3.6-8 8-8s8 3.6 8 8',
  chat: 'M4 5h16v11H9l-5 4z M8 9h8 M8 12h5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  play: 'M7 5l12 7-12 7z',
  pause: 'M8 5v14M16 5v14',
  flask: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 14h9',
};

export function Icon({ name, size = 18, title }: { name: string; size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}>
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  );
}
