const BASE = 'https://ll.thespacedevs.com/2.2.0';

export interface LL2Launch {
  id: string;
  name: string;
  status: { abbrev: string; name: string };
  net: string;
  window_start: string;
  window_end: string | null;
  rocket: { configuration: { name: string; full_name: string } };
  mission: {
    name: string;
    description: string;
    type: string;
  } | null;
  launch_service_provider: { name: string; type: string };
  pad: { name: string; location: { name: string } };
  vidURLs: Array<{ url: string; title: string }>;
  infoURLs: Array<{ url: string; title: string }>;
  /** Whether this is a crewed mission */
  mission_patches?: Array<{ name: string }>;
}

export interface LL2Response {
  count: number;
  next: string | null;
  results: LL2Launch[];
}

/** Criteria that make a launch notable enough to include */
export function isNotable(launch: LL2Launch): boolean {
  const rocketName = launch.rocket.configuration.full_name.toLowerCase();
  const missionType = launch.mission?.type?.toLowerCase() ?? '';

  const heavyLift = [
    'falcon heavy',
    'starship',
    'space launch system',
    'new glenn',
    'vulcan centaur',
  ].some((v) => rocketName.includes(v));

  const crewed = missionType.includes('human') || missionType.includes('crewed');

  const flagshipPayload = [
    'flagship',
    'new frontiers',
    'discovery',
    'planetary science',
    'earth science large',
    'space telescope',
    'mars',
    'lunar',
    'moon',
    'europa',
    'asteroid sample',
  ].some((v) => (launch.mission?.description ?? '').toLowerCase().includes(v));

  const maidenFlight =
    launch.name.toLowerCase().includes('maiden') ||
    launch.name.toLowerCase().includes('first flight') ||
    launch.name.toLowerCase().includes('debut');

  return heavyLift || crewed || flagshipPayload || maidenFlight;
}

export async function fetchUpcomingLaunches(apiKey?: string): Promise<LL2Launch[]> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Token ${apiKey}`;

  const results: LL2Launch[] = [];
  let url: string | null =
    `${BASE}/launch/upcoming/?limit=100&ordering=net&status=1,2,3`;

  while (url) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      console.warn('Launch Library 2 rate limited (429) — returning empty launch list');
      return [];
    }
    if (!res.ok) throw new Error(`Launch Library 2 error ${res.status}`);
    const data = (await res.json()) as LL2Response;
    results.push(...data.results);
    url = data.next;
  }

  return results.filter(isNotable);
}
