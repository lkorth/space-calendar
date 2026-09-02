/**
 * Integration tests against the live worker endpoint.
 * Asserts the ICS response is correctly structured and populated.
 *
 * Requires the worker to be deployed and KV populated by the pipeline.
 */
import { describe, it, expect } from 'vitest';

const BASE = 'https://space-calendar.lukekorth.com';

async function getFeed(params: string, { bypassCache = true } = {}): Promise<{ res: Response; body: string }> {
  const sep = params.includes('?') ? '&' : '?';
  const url = bypassCache ? `${BASE}/feed.ics${params}${sep}_bust=${Date.now()}` : `${BASE}/feed.ics${params}`;
  const res = await fetch(url);
  const body = await res.text();
  return { res, body };
}

function extractEvents(ics: string): string[] {
  return ics.split('BEGIN:VEVENT').slice(1).map((e) => 'BEGIN:VEVENT' + e.split('END:VEVENT')[0] + 'END:VEVENT');
}

// ---------------------------------------------------------------------------
// Response basics
// ---------------------------------------------------------------------------

describe('Worker feed — response', () => {
  it('returns 400 when no categories are provided', async () => {
    const { res } = await getFeed('');
    expect(res.status).toBe(400);
  });

  it('returns 200 with text/calendar content type', async () => {
    const { res } = await getFeed('?c=moon-phases');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/calendar');
  });

  it('sets Cache-Control with max-age of 1 hour', async () => {
    const { res } = await getFeed('?c=moon-phases', { bypassCache: false });
    const cc = res.headers.get('cache-control') ?? '';
    expect(cc).toContain('public');
    const match = cc.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    const maxAge = parseInt(match![1]!);
    expect(maxAge).toBeLessThanOrEqual(3600);
  });
});

// ---------------------------------------------------------------------------
// ICS envelope
// ---------------------------------------------------------------------------

describe('Worker feed — ICS envelope', () => {
  it('begins and ends with VCALENDAR', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body.trimStart()).toMatch(/^BEGIN:VCALENDAR/);
    expect(body).toContain('END:VCALENDAR');
  });

  it('includes required calendar properties', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body).toContain('VERSION:2.0');
    expect(body).toContain('PRODID:');
    expect(body).toContain('CALSCALE:GREGORIAN');
  });

  it('uses CRLF line endings throughout', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body).toMatch(/\r\n/);
    expect(body).not.toMatch(/(?<!\r)\n/);
  });

  it('folds lines longer than 75 octets with space continuation', async () => {
    const { body } = await getFeed('?c=moon-phases');
    const lines = body.split('\r\n');
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
    // Continuation lines (folded) start with a space — only check when events exist
    if (body.includes('BEGIN:VEVENT')) {
      const continuations = lines.filter((l) => l.startsWith(' '));
      expect(continuations.length).toBeGreaterThan(0);
    }
  });

  it('sets X-WR-CALNAME based on requested categories', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body).toContain('X-WR-CALNAME:Moon Phases');
  });
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

describe('Worker feed — events', () => {
  it('moon-phases returns events', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body).toContain('BEGIN:VEVENT');
  });

  it('BEGIN:VEVENT and END:VEVENT are balanced', async () => {
    const { body } = await getFeed('?c=moon-phases');
    const begins = (body.match(/BEGIN:VEVENT/g) ?? []).length;
    const ends = (body.match(/END:VEVENT/g) ?? []).length;
    expect(begins).toBe(ends);
    expect(begins).toBeGreaterThan(0);
  });

  it('each event has UID, DTSTART, DTEND, SUMMARY, DESCRIPTION', async () => {
    const { body } = await getFeed('?c=moon-phases');
    const events = extractEvents(body);
    for (const event of events) {
      expect(event).toMatch(/\r\nUID:/);
      expect(event).toMatch(/\r\nDTSTART/);
      expect(event).toMatch(/\r\nDTEND/);
      expect(event).toMatch(/\r\nSUMMARY:/);
      expect(event).toMatch(/\r\nDESCRIPTION:/);
    }
  });

  it('timed events use UTC datetime format (moon phases)', async () => {
    const { body } = await getFeed('?c=moon-phases');
    expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(body).toMatch(/DTEND:\d{8}T\d{6}Z/);
  });

  it('all-day events use DATE value format (meteor showers)', async () => {
    const { body } = await getFeed('?c=meteor-showers');
    expect(body).toContain('DTSTART;VALUE=DATE:');
    expect(body).toContain('DTEND;VALUE=DATE:');
  });

  it('events are sorted by start date', async () => {
    const { body } = await getFeed('?c=moon-phases');
    const dtStarts = [...body.matchAll(/DTSTART:(\d{8}T\d{6}Z)/g)].map((m) => m[1]!);
    expect(dtStarts.length).toBeGreaterThan(1);
    for (let i = 1; i < dtStarts.length; i++) {
      expect(dtStarts[i]! >= dtStarts[i - 1]!).toBe(true);
    }
  });

  it('multiple categories merge into one feed', async () => {
    const { body } = await getFeed('?c=moon-phases,meteor-showers');
    const moonCount = (body.match(/Full Moon|New Moon/g) ?? []).length;
    const showerCount = (body.match(/Meteor Shower/g) ?? []).length;
    expect(moonCount).toBeGreaterThan(0);
    expect(showerCount).toBeGreaterThan(0);
  });

  it('unknown category slug is ignored — feed still returns 200', async () => {
    const { res, body } = await getFeed('?c=moon-phases,not-a-real-slug');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VEVENT');
  });

  it('aurora without lat returns 200 with empty event list', async () => {
    const { res, body } = await getFeed('?c=aurora');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VCALENDAR');
  });

  it('milky-way without lat returns 200 with empty event list', async () => {
    const { res, body } = await getFeed('?c=milky-way');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VCALENDAR');
    expect(body).not.toContain('BEGIN:VEVENT');
  });

  it('milky-way with mid-latitude returns viewing window events', async () => {
    const { res, body } = await getFeed('?c=milky-way&lat=38&hemi=north&tz=America/Denver');
    expect(res.status).toBe(200);
    expect(body).toContain('Milky Way Viewing');
    expect(body).toContain('DTSTART:');
  });

  it('milky-way with high northern latitude returns 200 with no events (core never rises)', async () => {
    const { res, body } = await getFeed('?c=milky-way&lat=60&hemi=north');
    expect(res.status).toBe(200);
    expect(body).not.toContain('BEGIN:VEVENT');
  });

  it('returns 400 when lat and hemi contradict each other', async () => {
    const { res } = await getFeed('?c=moon-phases&lat=-45&hemi=north');
    expect(res.status).toBe(400);
  });

  it('astronomy-clubs jgap returns at least one event', async () => {
    const { res, body } = await getFeed('?c=astronomy-clubs&club=jgap');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('🔭');
  });

  it('launches returns at least one event', async () => {
    const { res, body } = await getFeed('?c=launches');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('🚀');
  });

  it('mission-milestones returns at least one event', async () => {
    const { res, body } = await getFeed('?c=mission-milestones');
    expect(res.status).toBe(200);
    expect(body).toContain('BEGIN:VEVENT');
    expect(body).toContain('🛸');
  });

  it('mission-milestones events are all-day with stable UIDs', async () => {
    const { body } = await getFeed('?c=mission-milestones');
    const events = extractEvents(body);
    for (const event of events) {
      expect(event).toContain('DTSTART;VALUE=DATE:');
      expect(event).toMatch(/UID:mission-milestone-\d+@space-calendar/);
    }
  });
});

// ---------------------------------------------------------------------------
// Static data — spot checks to confirm KV is populated
// ---------------------------------------------------------------------------

describe('Worker feed — static data spot checks', () => {
  it('solar eclipses returns events for 2026', async () => {
    const { body } = await getFeed('?c=eclipses-solar');
    expect(body).toContain('Solar Eclipse');
  });

  it('lunar eclipses returns events for 2026', async () => {
    const { body } = await getFeed('?c=eclipses-lunar');
    expect(body).toContain('Lunar Eclipse');
  });

  it('solstices-equinoxes returns at least 4 events', async () => {
    const { body } = await getFeed('?c=solstices-equinoxes');
    const events = extractEvents(body);
    expect(events.length).toBeGreaterThanOrEqual(4);
  });

  it('oppositions returns at least one event', async () => {
    const { body } = await getFeed('?c=oppositions');
    expect(body).toContain('Opposition');
  });

  it('elongations returns at least one event', async () => {
    const { body } = await getFeed('?c=elongations');
    expect(body).toContain('Elongation');
  });

  it('conjunctions returns at least one event', async () => {
    const { body } = await getFeed('?c=conjunctions');
    expect(body).toContain('Conjunction');
  });

  it('alignments returns at least one event', async () => {
    const { body } = await getFeed('?c=alignments');
    expect(body).toContain('BEGIN:VEVENT');
  });

  it('occultations returns at least one event', async () => {
    const { body } = await getFeed('?c=occultations');
    expect(body).toContain('Occultation');
  });

  it('asteroids returns at least one event', async () => {
    const { body } = await getFeed('?c=asteroids');
    expect(body).toContain('Asteroid');
  });

  it('history returns at least one event', async () => {
    const { body } = await getFeed('?c=history');
    expect(body).toContain('Years Ago');
  });

  it('deep-sky returns at least one event', async () => {
    const { body } = await getFeed('?c=deep-sky');
    expect(body).toContain('Messier Marathon');
  });

  it('comets returns a valid calendar', async () => {
    const { res } = await getFeed('?c=comets');
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Conditional requests
// ---------------------------------------------------------------------------

describe('Worker feed — conditional requests', () => {
  const params = '?c=moon-phases&tz=America/Chicago';

  // The worker always emits a strong validator, but Cloudflare weakens it to W/"..."
  // whenever it compresses the response, which depends on the client's Accept-Encoding.
  // Both forms are accepted here; what matters is that the value round-trips to a 304.
  const ETAG = /^(?:W\/)?"[0-9a-f]{32}"$/;

  it('sets an ETag on the ICS feed', async () => {
    const { res } = await getFeed(params, { bypassCache: false });
    expect(res.headers.get('etag')).toMatch(ETAG);
  });

  it('sets an ETag on the JSON feed', async () => {
    const res = await fetch(`${BASE}/feed.json${params}`);
    expect(res.headers.get('etag')).toMatch(ETAG);
  });

  it('answers a matching If-None-Match on the JSON feed with 304', async () => {
    const first = await fetch(`${BASE}/feed.json${params}`);
    const etag = first.headers.get('etag')!;

    const res = await fetch(`${BASE}/feed.json${params}`, { headers: { 'If-None-Match': etag } });
    expect(res.status).toBe(304);
  });

  it('answers a matching If-None-Match with an empty 304', async () => {
    const { res: first } = await getFeed(params, { bypassCache: false });
    const etag = first.headers.get('etag')!;

    const res = await fetch(`${BASE}/feed.ics${params}`, { headers: { 'If-None-Match': etag } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe('');
    expect(res.headers.get('etag')).toBe(etag);
  });

  it('accepts a validator that a cache has weakened', async () => {
    const { res: first } = await getFeed(params, { bypassCache: false });
    const etag = first.headers.get('etag')!;

    const res = await fetch(`${BASE}/feed.ics${params}`, {
      headers: { 'If-None-Match': `W/${etag}, "other"` },
    });
    expect(res.status).toBe(304);
  });

  it('serves the full body when the validator does not match', async () => {
    const res = await fetch(`${BASE}/feed.ics${params}`, { headers: { 'If-None-Match': '"stale"' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('BEGIN:VCALENDAR');
  });

  it('stamps DTSTAMP at the start of the UTC day so the body is stable between changes', async () => {
    const { body } = await getFeed('?c=moon-phases');
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    expect(body).toContain(`DTSTAMP:${today}T000000Z`);
  });
});

// ---------------------------------------------------------------------------
// Legacy and malformed subscription URLs
// ---------------------------------------------------------------------------

describe('Worker feed — legacy category slugs', () => {
  it('expands sky-events to its replacement categories', async () => {
    const { res, body } = await getFeed('?c=sky-events');
    expect(res.status).toBe(200);
    // Titles are emoji-prefixed, so match on the distinctive words instead.
    expect(body).toContain('Moon');
    expect(body).toMatch(/Equinox|Solstice/);
    expect(body).toContain('Eclipse');
  });

  it('expands planetary to its replacement categories', async () => {
    const { res, body } = await getFeed('?c=planetary');
    expect(res.status).toBe(200);
    // comets is also in the expansion but is legitimately empty in some windows,
    // so it is not asserted here.
    expect(body).toMatch(/Opposition|Elongation/);
  });

  it('serves the production legacy URL that mixes groups with their own members', async () => {
    const { res, body } = await getFeed('?c=moon-phases,sky-events,planetary,meteor-showers,launches,history');
    expect(res.status).toBe(200);
    // Each UID appears once despite moon-phases and meteor-showers being listed
    // both directly and via sky-events.
    const uids = [...body.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]!.trim());
    expect(uids.length).toBeGreaterThan(0);
    expect(new Set(uids).size).toBe(uids.length);
  });
});

describe('Worker feed — malformed subscription URLs', () => {
  it('recovers hemi from a double-encoded query tail', async () => {
    const { body } = await getFeed('?c=solstices-equinoxes%26hemi%3Dsouth');
    expect(body).toContain('Southern Hemisphere');
  });

  it('recovers lat from a double-encoded query tail', async () => {
    // The latitude/hemisphere cross-check can only reject this if lat was parsed.
    const { res: mismatched } = await getFeed('?c=moon-phases%26lat%3D-45%26hemi%3Dnorth');
    expect(mismatched.status).toBe(400);

    const { res: consistent } = await getFeed('?c=moon-phases%26lat%3D45%26hemi%3Dnorth');
    expect(consistent.status).toBe(200);
  });

  it('recovers tz from a double-encoded query tail', async () => {
    const encoded = await getFeed('?c=eclipses-lunar%26tz%3DAsia%2FTokyo');
    const plain = await getFeed('?c=eclipses-lunar&tz=Asia/Tokyo');
    const utc = await getFeed('?c=eclipses-lunar');

    const contactTime = (ics: string) => /Greatest eclipse: (\d{2}:\d{2} [^\\\r\n]+)/.exec(ics)?.[1];
    expect(contactTime(encoded.body)).toBeDefined();
    expect(contactTime(encoded.body)).toBe(contactTime(plain.body));
    expect(contactTime(encoded.body)).not.toBe(contactTime(utc.body));
  });

  it('does not reject a non-numeric latitude', async () => {
    const { res } = await getFeed('?c=moon-phases&lat=not-a-number');
    expect(res.status).toBe(200);
  });

  it('accepts every spelling of the southern hemisphere', async () => {
    for (const hemi of ['south', 'southern', 'S']) {
      const { body } = await getFeed(`?c=solstices-equinoxes&hemi=${hemi}`);
      expect(body, `hemi=${hemi}`).toContain('Southern Hemisphere');
    }
  });
});

describe('Worker feed — timezone handling', () => {
  const contactTime = (ics: string) => /Greatest eclipse: (\d{2}:\d{2} [^\\\r\n]+)/.exec(ics)?.[1];

  it('normalizes every fixed-offset spelling to one zone', async () => {
    const results = await Promise.all(
      ['Etc%2FGMT-2', 'UTC%2B2', '%2B02%3A00'].map((tz) => getFeed(`?c=eclipses-lunar&tz=${tz}`)),
    );
    const times = results.map((r) => contactTime(r.body));
    expect(times[0]).toBeDefined();
    expect(new Set(times).size).toBe(1);
  });

  it('keeps serving the fixed-offset subscription seen in production', async () => {
    const { res } = await getFeed(
      '?c=moon-phases,meteor-showers,eclipses-solar,eclipses-lunar,solstices-equinoxes,conjunctions,comets,mission-milestones&tz=Etc%2FGMT-2',
    );
    expect(res.status).toBe(200);
  });

  it('falls back to UTC for an unparseable timezone', async () => {
    const { body } = await getFeed('?c=eclipses-lunar&tz=Not%2FATimezone');
    expect(contactTime(body)).toMatch(/UTC$/);
  });
});

// ---------------------------------------------------------------------------
// Static assets — the configurator shares the feed's domain
// ---------------------------------------------------------------------------

describe('Worker site — static assets', () => {
  it('serves the configurator at the root without redirecting', async () => {
    // The root previously 301'd to a pages.dev host that no longer resolved. Assets are
    // matched before the Worker runs, so the page is served directly from this domain.
    const res = await fetch(`${BASE}/`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');

    const body = await res.text();
    expect(body).toContain('Space Calendar');
    expect(body).toContain('id="btn-apple"');
  });

  it('serves the latitude table the page fetches at runtime', async () => {
    // The configurator resolves zip codes client-side against this file, requested with a
    // relative URL — so it has to resolve on the same origin as the page.
    const res = await fetch(`${BASE}/zip-latitudes.json`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
  });

  it('does not publish the site test file', async () => {
    // src/site/.assetsignore keeps it out of the bundle; GitHub Pages used to serve it.
    const res = await fetch(`${BASE}/site.test.ts`);
    expect(res.status).toBe(404);
  });

  it('does not publish the assetsignore control file', async () => {
    const res = await fetch(`${BASE}/.assetsignore`);
    expect(res.status).toBe(404);
  });

  it('still routes the feed paths to the Worker', async () => {
    // Assets must not shadow the feed endpoints.
    const [ics, json] = await Promise.all([
      fetch(`${BASE}/feed.ics?c=moon-phases`),
      fetch(`${BASE}/feed.json?c=moon-phases`),
    ]);
    expect(ics.headers.get('content-type')).toContain('text/calendar');
    expect(json.headers.get('content-type')).toContain('application/json');
  });

  it('404s an unknown path rather than falling back to the page', async () => {
    // not_found_handling is left at its default, so there is no SPA-style catch-all that
    // would answer 200 for a mistyped feed URL.
    const res = await fetch(`${BASE}/not-a-real-path`);
    expect(res.status).toBe(404);
  });

  it('accepts a campaign-tagged landing URL', async () => {
    const res = await fetch(`${BASE}/?utm_source=instagram`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });
});
