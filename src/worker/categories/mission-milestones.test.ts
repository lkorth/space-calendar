import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNotableEvent } from '../clients/ll2-events.ts';
import { toCalendarEvent, missionMilestonesCategory } from './mission-milestones.ts';
import type { LL2Event } from '../clients/ll2-events.ts';
import type { KVNamespace } from '@cloudflare/workers-types';

function makeEvent(overrides: Partial<LL2Event> = {}): LL2Event {
  return {
    id: 1017,
    slug: 'juice-earth-flyby',
    name: 'Juice Earth Flyby',
    type: { id: 23, name: 'Flyby' },
    date: '2026-09-30T00:00:00Z',
    date_precision: { id: 7, name: 'Month', abbrev: 'M' },
    description: 'Third flyby of ESA\'s JUICE mission on its way to Jupiter.',
    location: 'Earth',
    news_url: null,
    video_url: null,
    program: [],
    ...overrides,
  };
}

describe('isNotableEvent', () => {
  it('includes Flyby events', () => {
    expect(isNotableEvent(makeEvent({ type: { id: 23, name: 'Flyby' } }))).toBe(true);
  });

  it('includes Orbital Insertion events', () => {
    expect(isNotableEvent(makeEvent({ type: { id: 5, name: 'Orbital Insertion' } }))).toBe(true);
  });

  it('includes Spacecraft Landing events', () => {
    expect(isNotableEvent(makeEvent({ type: { id: 9, name: 'Spacecraft Landing' } }))).toBe(true);
  });

  it('excludes ISS EVAs', () => {
    expect(isNotableEvent(makeEvent({
      type: { id: 3, name: 'EVA' },
      location: 'International Space Station',
    }))).toBe(false);
  });

  it('excludes Tiangong EVAs', () => {
    expect(isNotableEvent(makeEvent({
      type: { id: 3, name: 'EVA' },
      location: 'Tiangong Space Station',
    }))).toBe(false);
  });

  it('includes EVAs not at a space station', () => {
    expect(isNotableEvent(makeEvent({
      type: { id: 3, name: 'EVA' },
      location: 'Moon',
    }))).toBe(true);
  });

  it('excludes Docking events', () => {
    expect(isNotableEvent(makeEvent({ type: { id: 2, name: 'Docking' } }))).toBe(false);
  });
});

describe('toCalendarEvent', () => {
  it('prefixes title with spacecraft emoji', () => {
    const event = toCalendarEvent(makeEvent());
    expect(event.title).toBe('🛸 Juice Earth Flyby');
  });

  it('uses stable UID from event id', () => {
    const event = toCalendarEvent(makeEvent({ id: 1017 }));
    expect(event.uid).toBe('mission-milestone-1017@space-calendar');
  });

  it('extracts date portion for all-day event', () => {
    const event = toCalendarEvent(makeEvent({ date: '2026-09-30T00:00:00Z' }));
    expect(event.start).toBe('2026-09-30');
    expect(event.end).toBe('2026-10-01');
    expect(event.allDay).toBe(true);
  });

  it('falls back to thespacedevs.com when news_url is null', () => {
    const event = toCalendarEvent(makeEvent({ news_url: null }));
    expect(event.url).toBe('https://thespacedevs.com/');
  });

  it('uses news_url when present', () => {
    const event = toCalendarEvent(makeEvent({ news_url: 'https://esa.int/juice' }));
    expect(event.url).toBe('https://esa.int/juice');
  });

  it('includes description and location in body', () => {
    const event = toCalendarEvent(makeEvent());
    expect(event.description).toContain('Third flyby');
    expect(event.description).toContain('Location: Earth');
  });

  it('sets category to mission-milestones', () => {
    const event = toCalendarEvent(makeEvent());
    expect(event.category).toBe('mission-milestones');
  });
});

function makeKV(store: Record<string, string> = {}) {
  return {
    get: (key: string) => Promise.resolve(store[key] ?? null),
    put: vi.fn().mockResolvedValue(undefined),
  };
}

function makeLL2Response(events: LL2Event[]) {
  return { ok: true, status: 200, json: () => Promise.resolve({ count: events.length, next: null, results: events }) };
}

describe('missionMilestonesCategory cache flag', () => {
  beforeEach(() => { vi.restoreAllMocks(); });

  it('returns cache: true and events when served from KV', async () => {
    const cached = [toCalendarEvent(makeEvent())];
    const env = { CALENDAR_KV: makeKV({ 'mission-milestones': JSON.stringify(cached) }) as unknown as KVNamespace };
    const result = await missionMilestonesCategory.fetch(env, { categories: ['mission-milestones'] });
    expect(result.cache).toBe(true);
    expect(result.events).toHaveLength(1);
  });

  it('returns cache: true and writes KV when API returns events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeLL2Response([makeEvent()])));
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    const result = await missionMilestonesCategory.fetch(env, { categories: ['mission-milestones'] });
    expect(result.cache).toBe(true);
    expect(result.events).toHaveLength(1);
    expect(kv.put).toHaveBeenCalledWith('mission-milestones', expect.any(String), { expirationTtl: 3600 });
  });

  it('returns cache: false and skips KV write when API is rate limited (429)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 }));
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    const result = await missionMilestonesCategory.fetch(env, { categories: ['mission-milestones'] });
    expect(result.cache).toBe(false);
    expect(result.events).toHaveLength(0);
    expect(kv.put).not.toHaveBeenCalled();
  });

  it('returns cache: true and writes KV when API returns empty (no notable events)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeLL2Response([])));
    const kv = makeKV();
    const env = { CALENDAR_KV: kv as unknown as KVNamespace };
    const result = await missionMilestonesCategory.fetch(env, { categories: ['mission-milestones'] });
    expect(result.cache).toBe(true);
    expect(result.events).toHaveLength(0);
    expect(kv.put).toHaveBeenCalledWith('mission-milestones', '[]', { expirationTtl: 3600 });
  });

  it('end date rolls over correctly at month boundary', () => {
    const event = toCalendarEvent(makeEvent({ date: '2026-11-30T00:00:00Z' }));
    expect(event.start).toBe('2026-11-30');
    expect(event.end).toBe('2026-12-01');
  });
});
