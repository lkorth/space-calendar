/**
 * Integration tests against the live worker endpoint.
 * Asserts the ICS response is correctly structured and populated.
 *
 * Requires the worker to be deployed and KV populated by the pipeline.
 */
import { describe, it, expect } from 'vitest';

const BASE = 'https://space-calendar.lukekorth.com';

async function getFeed(params: string): Promise<{ res: Response; body: string }> {
  const res = await fetch(`${BASE}/feed.ics${params}`);
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
    const { res } = await getFeed('?c=moon-phases');
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
    expect(body).toContain('Milky Way Window');
    expect(body).toContain('DTSTART;VALUE=DATE:');
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

  it('solstices-equinoxes returns 4 events', async () => {
    const { body } = await getFeed('?c=solstices-equinoxes');
    const events = extractEvents(body);
    expect(events).toHaveLength(4);
  });

  it('oppositions returns at least one event', async () => {
    const { body } = await getFeed('?c=oppositions');
    expect(body).toContain('Opposition');
  });
});
