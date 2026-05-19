const BASE = 'https://ll.thespacedevs.com/2.2.0';


export interface LL2Event {
  id: number;
  slug: string;
  name: string;
  type: { id: number; name: string };
  date: string;
  date_precision: { id: number; name: string; abbrev: string };
  description: string;
  location: string;
  news_url: string | null;
  video_url: string | null;
  program: Array<{ id: number; name: string }>;
}

interface LL2EventsResponse {
  count: number;
  next: string | null;
  results: LL2Event[];
}

export function isNotableEvent(event: LL2Event): boolean {
  switch (event.type.name) {
    case 'Flyby':
    case 'Orbital Insertion':
    case 'Spacecraft Landing':
      return true;
    case 'EVA':
      return !event.location.toLowerCase().includes('space station');
    default:
      return false;
  }
}

export async function fetchUpcomingEvents(apiKey?: string): Promise<LL2Event[] | null> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['Authorization'] = `Token ${apiKey}`;

  const results: LL2Event[] = [];
  let url: string | null = `${BASE}/event/upcoming/?limit=100`;

  while (url) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      console.warn('Launch Library 2 rate limited (429) — returning empty events list');
      return null;
    }
    if (!res.ok) throw new Error(`Launch Library 2 events error ${res.status}`);
    const data = (await res.json()) as LL2EventsResponse;
    results.push(...data.results);
    url = data.next;
  }

  return results.filter(isNotableEvent);
}
