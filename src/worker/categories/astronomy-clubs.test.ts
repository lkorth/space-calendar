import { describe, it, expect } from 'vitest';
import { parseJgapEvents, CLUBS } from './astronomy-clubs.ts';

const SAMPLE_TEXT = `
John Glenn Astronomy Park
Programs & Reservations
Jupiter and Venus in the West
30 spots
Friday, May 22, 2026 at 8:45 PM EDT
With Jupiter setting in the west, this is a good time to get a last look before it is lost in the evening twilight.
Reserve
LINK:https://registration.jgap.org/?event=abc1
Jupiter and Venus in the West
11 spots
Saturday, May 23, 2026 at 8:45 PM EDT
With Jupiter setting in the west, this is a good time to get a last look before it is lost in the evening twilight.
Reserve
LINK:https://registration.jgap.org/?event=abc2
The Bright Moon
45 spots
Friday, May 29, 2026 at 8:45 PM EDT
The nearly full moon lights up our plaza. Come learn how moonlight reveals the true colors of the world.
Reserve
LINK:https://registration.jgap.org/?event=abc3
How Far Are the Galaxies
65 spots
Saturday, July 4, 2026 at 9:00 PM EDT
Celebrating Henrietta Swann Leavitt's birthday with telescope views of galaxies.
Reserve
LINK:https://registration.jgap.org/?event=abc4
`.trim();

// Inline format: title, date, and spots all on one line
const INLINE_TEXT = `
Jupiter and Venus in the West – Friday, May 22, 2026 at 8:45 PM EDT (30 spots)
The Bright Moon – Friday, May 29, 2026 at 8:45 PM EDT (45 spots)
`.trim();

describe('parseJgapEvents', () => {
  it('parses events from multi-line format', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    expect(events).toHaveLength(4);
  });

  it('extracts correct titles', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    expect(events[0]!.title).toBe('Jupiter and Venus in the West');
    expect(events[1]!.title).toBe('Jupiter and Venus in the West');
    expect(events[2]!.title).toBe('The Bright Moon');
    expect(events[3]!.title).toBe('How Far Are the Galaxies');
  });

  it('converts EDT (UTC-4) to UTC correctly', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    // 8:45 PM EDT = 20:45 + 4 = 00:45 UTC next day
    expect(events[0]!.startUtc.toISOString()).toBe('2026-05-23T00:45:00.000Z');
  });

  it('sets event end 2 hours after start', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    const start = events[0]!.startUtc.getTime();
    const end = events[0]!.endUtc.getTime();
    expect(end - start).toBe(2 * 60 * 60 * 1000);
  });

  it('handles 9:00 PM time correctly', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    // 9:00 PM EDT = 21:00 + 4 = 01:00 UTC next day
    expect(events[3]!.startUtc.toISOString()).toBe('2026-07-05T01:00:00.000Z');
  });

  it('captures spots from separate line', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    expect(events[0]!.spotsLeft).toBe(30);
    expect(events[1]!.spotsLeft).toBe(11);
    expect(events[2]!.spotsLeft).toBe(45);
    expect(events[3]!.spotsLeft).toBe(65);
  });

  it('captures per-event registration URLs', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    expect(events[0]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc1');
    expect(events[1]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc2');
    expect(events[2]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc3');
    expect(events[3]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc4');
  });

  it('parses events from inline (title – date) format', () => {
    const events = parseJgapEvents(INLINE_TEXT);
    expect(events).toHaveLength(2);
    expect(events[0]!.title).toBe('Jupiter and Venus in the West');
    expect(events[1]!.title).toBe('The Bright Moon');
  });

  it('captures inline spots from "(N spots)" suffix', () => {
    const events = parseJgapEvents(INLINE_TEXT);
    expect(events[0]!.spotsLeft).toBe(30);
    expect(events[1]!.spotsLeft).toBe(45);
  });

  it('captures description text between date line and Reserve', () => {
    const events = parseJgapEvents(SAMPLE_TEXT);
    expect(events[0]!.description).toBe(
      'With Jupiter setting in the west, this is a good time to get a last look before it is lost in the evening twilight.',
    );
    expect(events[2]!.description).toBe(
      'The nearly full moon lights up our plaza. Come learn how moonlight reveals the true colors of the world.',
    );
  });

  it('joins multi-line descriptions with a space', () => {
    const text = `The Hero, The Hunter\n46 spots\nFriday, June 12, 2026 at 8:45 PM EDT\nLearn the stories of constellations high overhead.\nExplore dramatic star clusters.\nReserve\nLINK:https://registration.jgap.org/?event=x`;
    const events = parseJgapEvents(text);
    expect(events[0]!.description).toBe(
      'Learn the stories of constellations high overhead. Explore dramatic star clusters.',
    );
  });

  it('returns undefined description when no text between date and Reserve', () => {
    const text = `Spring Turns to Summer\nFriday, June 19, 2026 at 8:45 PM EDT\nReserve\nLINK:https://registration.jgap.org/?event=x`;
    const events = parseJgapEvents(text);
    expect(events[0]!.description).toBeUndefined();
  });

  it('returns undefined spotsLeft when no spots data present', () => {
    const text = `Spring Turns to Summer\nFriday, June 19, 2026 at 8:45 PM EDT`;
    const events = parseJgapEvents(text);
    expect(events[0]!.spotsLeft).toBeUndefined();
  });

  it('returns undefined registrationUrl when no LINK present', () => {
    const text = `Spring Turns to Summer\nFriday, June 19, 2026 at 8:45 PM EDT`;
    const events = parseJgapEvents(text);
    expect(events[0]!.registrationUrl).toBeUndefined();
  });

  it('returns empty array for text with no events', () => {
    expect(parseJgapEvents('John Glenn Astronomy Park\nWelcome to our programs')).toHaveLength(0);
  });

  it('skips spots lines when looking back for title', () => {
    const text = `Spring Turns to Summer\n58 spots\nFriday, June 19, 2026 at 8:45 PM EDT`;
    const events = parseJgapEvents(text);
    expect(events).toHaveLength(1);
    expect(events[0]!.title).toBe('Spring Turns to Summer');
  });

  it('does not use a LINK: line as the title', () => {
    const text = `LINK:https://registration.jgap.org/?event=prev\nThe Hero, The Hunter\n46 spots\nFriday, June 12, 2026 at 8:45 PM EDT`;
    const events = parseJgapEvents(text);
    expect(events[0]!.title).toBe('The Hero, The Hunter');
  });

  it('handles ordinal date suffixes (22nd, 29th)', () => {
    const text = `The Hero, The Hunter\n46 spots\nFriday, June 12th, 2026 at 8:45 PM EDT`;
    const events = parseJgapEvents(text);
    expect(events).toHaveLength(1);
    expect(events[0]!.startUtc.toISOString()).toBe('2026-06-13T00:45:00.000Z');
  });
});

describe('CLUBS registry', () => {
  it('includes JGAP', () => {
    const jgap = CLUBS.find((c) => c.id === 'jgap');
    expect(jgap).toBeDefined();
    expect(jgap!.name).toBe('John Glenn Astronomy Park');
    expect(jgap!.scrapeUrl).toBe('https://registration.jgap.org/');
  });

  it('all clubs have required fields', () => {
    for (const club of CLUBS) {
      expect(club.id).toBeTruthy();
      expect(club.name).toBeTruthy();
      expect(club.location).toBeTruthy();
      expect(club.websiteUrl).toBeTruthy();
      expect(club.scrapeUrl).toBeTruthy();
      expect(typeof club.parseEvents).toBe('function');
    }
  });
});
