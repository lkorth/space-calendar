/**
 * Integration test: asserts the real Launch Library 2 events API response
 * shape matches our client interface and unit test fixtures.
 *
 * If this test fails, update fetchUpcomingEvents() in ll2-events.ts
 * AND update the makeEvent() fixture in mission-milestones.test.ts.
 *
 * Note: free tier is 15 req/hr — this test uses 1 request.
 */
import { describe, it, expect } from 'vitest';
import { fetchUpcomingEvents } from './ll2-events.ts';

describe('Launch Library 2 events API (real)', () => {
  it('returns an array', async () => {
    const events = await fetchUpcomingEvents();
    expect(Array.isArray(events)).toBe(true);
  });

  it('each event has required fields with correct types', async () => {
    const events = await fetchUpcomingEvents();
    if (events.length === 0) return;

    const event = events[0]!;
    expect(typeof event.id).toBe('number');
    expect(typeof event.slug).toBe('string');
    expect(typeof event.name).toBe('string');
    expect(typeof event.type.name).toBe('string');
    expect(typeof event.date).toBe('string');
    expect(typeof event.date_precision.abbrev).toBe('string');
    expect(typeof event.description).toBe('string');
    expect(typeof event.location).toBe('string');
    expect(Array.isArray(event.program)).toBe(true);
  });

  it('date is an ISO 8601 string', async () => {
    const events = await fetchUpcomingEvents();
    if (events.length === 0) return;

    for (const event of events) {
      expect(new Date(event.date).toISOString()).toBeTruthy();
    }
  });

  it('only returns notable event types', async () => {
    const events = await fetchUpcomingEvents();
    const NOTABLE = new Set(['Flyby', 'Orbital Insertion', 'Spacecraft Landing', 'EVA']);
    for (const event of events) {
      expect(NOTABLE.has(event.type.name)).toBe(true);
    }
  });

  it('news_url is null or a string', async () => {
    const events = await fetchUpcomingEvents();
    if (events.length === 0) return;

    for (const event of events) {
      expect(event.news_url === null || typeof event.news_url === 'string').toBe(true);
    }
  });
});
