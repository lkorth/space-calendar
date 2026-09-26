const BASE = 'https://ll.thespacedevs.com/2.2.0';

export interface LL2Launch {
  id: string;
  name: string;
  status: { abbrev: string; name: string };
  net: string;
  net_precision?: { id: number; name: string; abbrev: string; description: string } | null;
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
  vidURLs?: Array<{ url: string; title: string }> | null;
  infoURLs?: Array<{ url: string; title: string }> | null;
  /** Whether this is a crewed mission */
  mission_patches?: Array<{ name: string }>;
}

export interface LL2Response {
  count: number;
  next: string | null;
  results: LL2Launch[];
}

/**
 * LL2 precision IDs run from 0 (Second) through 5 (Day), 6 (Week), 7 (Month), then
 * coarser buckets: quarters (8–11), halves (12–13), Year (14), Fiscal Year (15), Decade (16).
 * Coarse launches have their NET set to the last day of the period, which piles them onto
 * a single misleading date (e.g. June 30), so they are dropped until LL2 narrows the date.
 */
const MONTH_PRECISION_ID = 7;

/** Whether the launch date is known to at least the month */
export function hasUsableDate(launch: LL2Launch): boolean {
  if (!launch.net_precision) return true;
  return launch.net_precision.id <= MONTH_PRECISION_ID;
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

  const scienceMission = missionType === 'astrophysics' || missionType === 'planetary science';

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

  return heavyLift || crewed || scienceMission || flagshipPayload || maidenFlight;
}

export async function fetchUpcomingLaunches(apiKey?: string): Promise<LL2Launch[] | null> {
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Token ${apiKey}`;

  const results: LL2Launch[] = [];
  let url: string | null = `${BASE}/launch/upcoming/?limit=100&ordering=net`;

  while (url) {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      console.warn('Launch Library 2 rate limited (429) — returning empty launch list');
      return null;
    }
    if (!res.ok) throw new Error(`Launch Library 2 error ${res.status}`);
    const data = (await res.json()) as LL2Response;
    results.push(...data.results);
    url = data.next;
  }

  return results.filter((launch) => hasUsableDate(launch) && isNotable(launch));
}
