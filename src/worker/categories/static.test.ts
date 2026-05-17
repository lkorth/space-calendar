import { describe, it, expect } from 'vitest';
import { makeStaticCategory, makeSolsticesCategory, applyHemisphere } from './static.ts';
import type { CalendarEvent } from '../../shared/models.ts';

function makeKV(store: Record<string, string>) {
  return { get: (key: string) => Promise.resolve(store[key] ?? null) };
}

const sampleEvents: CalendarEvent[] = [
  {
    uid: 'moon-2026-01-01@space-calendar',
    title: 'Full Moon',
    start: '2026-01-01T12:00:00Z',
    end: '2026-01-01T12:00:00Z',
    allDay: false,
    description: 'The moon is full.',
    category: 'moon-phases',
  },
];

const NH_SOLSTICE_EVENTS: CalendarEvent[] = [
  {
    uid: 'season-equinox-3-2026@space-calendar',
    title: 'March Equinox — Vernal Equinox (Northern Hemisphere)',
    start: '2026-03-20T14:46:00Z',
    end: '2026-03-20T14:46:00Z',
    allDay: false,
    description: 'In the Northern Hemisphere this marks the astronomical start of spring; in the Southern Hemisphere, the start of autumn.',
    url: 'https://aa.usno.navy.mil/data/EarthSeasons',
    category: 'solstices-equinoxes',
  },
  {
    uid: 'season-solstice-6-2026@space-calendar',
    title: 'June Solstice — Summer Solstice (Northern Hemisphere)',
    start: '2026-06-21T08:24:00Z',
    end: '2026-06-21T08:24:00Z',
    allDay: false,
    description: "The Sun reaches its northernmost point — the longest day of the year in the Northern Hemisphere and the shortest in the Southern.",
    url: 'https://aa.usno.navy.mil/data/EarthSeasons',
    category: 'solstices-equinoxes',
  },
  {
    uid: 'season-equinox-9-2026@space-calendar',
    title: 'September Equinox — Autumnal Equinox (Northern Hemisphere)',
    start: '2026-09-23T00:05:00Z',
    end: '2026-09-23T00:05:00Z',
    allDay: false,
    description: 'In the Northern Hemisphere this marks the astronomical start of autumn; in the Southern Hemisphere, the start of spring.',
    url: 'https://aa.usno.navy.mil/data/EarthSeasons',
    category: 'solstices-equinoxes',
  },
  {
    uid: 'season-solstice-12-2026@space-calendar',
    title: 'December Solstice — Winter Solstice (Northern Hemisphere)',
    start: '2026-12-21T20:50:00Z',
    end: '2026-12-21T20:50:00Z',
    allDay: false,
    description: "The Sun reaches its southernmost point — the shortest day of the year in the Northern Hemisphere and the longest in the Southern.",
    url: 'https://aa.usno.navy.mil/data/EarthSeasons',
    category: 'solstices-equinoxes',
  },
];

describe('makeStaticCategory', () => {
  it('reads events from KV under the static:<slug> key', async () => {
    const kv = makeKV({ 'static:moon-phases': JSON.stringify(sampleEvents) });
    const category = makeStaticCategory('moon-phases');
    const events = await category.fetch(
      { CALENDAR_KV: kv as unknown as KVNamespace },
      { categories: ['moon-phases'] },
    );
    expect(events).toHaveLength(1);
    expect(events[0]?.title).toBe('Full Moon');
  });

  it('returns empty array when KV key does not exist', async () => {
    const kv = makeKV({});
    const category = makeStaticCategory('moon-phases');
    const events = await category.fetch(
      { CALENDAR_KV: kv as unknown as KVNamespace },
      { categories: ['moon-phases'] },
    );
    expect(events).toHaveLength(0);
  });

  it('uses the correct slug as the KV key prefix', async () => {
    const kv = makeKV({ 'static:eclipses-solar': JSON.stringify(sampleEvents) });
    const category = makeStaticCategory('eclipses-solar');
    const events = await category.fetch(
      { CALENDAR_KV: kv as unknown as KVNamespace },
      { categories: ['eclipses-solar'] },
    );
    expect(events).toHaveLength(1);
  });

  it('returns the correct slug on the category object', () => {
    const category = makeStaticCategory('meteor-showers');
    expect(category.slug).toBe('meteor-showers');
  });
});

describe('applyHemisphere', () => {
  it('returns the event unchanged for northern hemisphere', () => {
    const event = NH_SOLSTICE_EVENTS[0]!;
    expect(applyHemisphere(event, 'northern')).toBe(event);
  });

  it('rewrites March Equinox title for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[0]!, 'southern');
    expect(result.title).toBe('March Equinox — Autumnal Equinox (Southern Hemisphere)');
  });

  it('rewrites June Solstice title for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[1]!, 'southern');
    expect(result.title).toBe('June Solstice — Winter Solstice (Southern Hemisphere)');
  });

  it('rewrites September Equinox title for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[2]!, 'southern');
    expect(result.title).toBe('September Equinox — Vernal Equinox (Southern Hemisphere)');
  });

  it('rewrites December Solstice title for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[3]!, 'southern');
    expect(result.title).toBe('December Solstice — Summer Solstice (Southern Hemisphere)');
  });

  it('rewrites spring/autumn in March Equinox description for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[0]!, 'southern');
    expect(result.description).toContain('start of autumn');
    expect(result.description).toContain('start of spring');
    // Should NOT lead with "Northern Hemisphere this marks the start of spring"
    expect(result.description).not.toMatch(/Northern Hemisphere this marks.*spring/);
  });

  it('rewrites longest/shortest day in June Solstice description for southern hemisphere', () => {
    const result = applyHemisphere(NH_SOLSTICE_EVENTS[1]!, 'southern');
    expect(result.description).toContain('shortest day of the year in the Southern Hemisphere');
  });

  it('does not double-rewrite — applying twice gives same result as once', () => {
    const once = applyHemisphere(NH_SOLSTICE_EVENTS[0]!, 'southern');
    const twice = applyHemisphere(once, 'southern');
    // Applying to an already-rewritten event should not corrupt the text further
    // (the title won't match the NH map so it returns unchanged on second pass)
    expect(twice.title).toBe(once.title);
  });
});

describe('makeSolsticesCategory', () => {
  it('returns NH events unchanged when hemisphere is northern', async () => {
    const kv = makeKV({ 'static:solstices-equinoxes': JSON.stringify(NH_SOLSTICE_EVENTS) });
    const cat = makeSolsticesCategory('northern');
    const events = await cat.fetch({ CALENDAR_KV: kv as unknown as KVNamespace }, { categories: ['solstices-equinoxes'] });
    expect(events[0]!.title).toContain('Northern Hemisphere');
  });

  it('returns SH-rewritten events when hemisphere is southern', async () => {
    const kv = makeKV({ 'static:solstices-equinoxes': JSON.stringify(NH_SOLSTICE_EVENTS) });
    const cat = makeSolsticesCategory('southern');
    const events = await cat.fetch({ CALENDAR_KV: kv as unknown as KVNamespace }, { categories: ['solstices-equinoxes'] });
    expect(events.every((e) => e.title.includes('Southern Hemisphere'))).toBe(true);
  });

  it('defaults to northern when hemisphere is undefined', async () => {
    const kv = makeKV({ 'static:solstices-equinoxes': JSON.stringify(NH_SOLSTICE_EVENTS) });
    const cat = makeSolsticesCategory(undefined);
    const events = await cat.fetch({ CALENDAR_KV: kv as unknown as KVNamespace }, { categories: ['solstices-equinoxes'] });
    expect(events[0]!.title).toContain('Northern Hemisphere');
  });
});
