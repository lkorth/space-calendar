import { describe, it, expect } from 'vitest';
import { makeStaticCategory } from './static.ts';
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
