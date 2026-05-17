import { describe, it, expect } from 'vitest';
import { fetchPageText, parseJgapEvents, CLUBS } from './astronomy-clubs.ts';

describe('JGAP scraper — live page', () => {
  it('parses at least one event from the live registration page', async () => {
    const jgap = CLUBS.find((c) => c.id === 'jgap')!;
    const text = await fetchPageText(jgap.scrapeUrl);
    const events = parseJgapEvents(text);
    expect(events.length).toBeGreaterThan(0);
  }, 15000);

  it('all parsed events have titles, valid UTC dates, and end after start', async () => {
    const jgap = CLUBS.find((c) => c.id === 'jgap')!;
    const text = await fetchPageText(jgap.scrapeUrl);
    const events = parseJgapEvents(text);
    for (const event of events) {
      expect(event.title.length).toBeGreaterThan(0);
      expect(event.startUtc).toBeInstanceOf(Date);
      expect(isNaN(event.startUtc.getTime())).toBe(false);
      expect(event.endUtc.getTime()).toBeGreaterThan(event.startUtc.getTime());
    }
  }, 15000);
});
