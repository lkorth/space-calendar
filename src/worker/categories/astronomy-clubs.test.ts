import { describe, it, expect } from 'vitest';
import { parseJgapEvents, parseIcalEvents, unescapeIcalText, isUsDst, getTzOffsetHours, CLUBS } from './astronomy-clubs.ts';

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

// Actual format served by registration.jgap.org: time embedded in title, date on its own line
const ACTUAL_PAGE_TEXT = `
Jupiter and Venus in the West: 8:45 PM EDT
(30 spots left)
Friday May 22nd 2026
With Jupiter setting in the west, this week is a good time to get a last look before it is lost in the evening twilight.
Reserve
LINK:https://registration.jgap.org/?event=abc1
Jupiter and Venus in the West: 8:45 PM EDT
(11 spots left)
Saturday May 23rd 2026
With Jupiter setting in the west, this week is a good time to get a last look before it is lost in the evening twilight.
Reserve
LINK:https://registration.jgap.org/?event=abc2
The Bright Moon: 8:45 PM EDT
(45 spots left)
Friday May 29th 2026
The nearly full moon lights up our plaza. Come learn how moonlight reveals the true colors of the world.
Reserve
LINK:https://registration.jgap.org/?event=abc3
How Far Are the Galaxies: 9:00 PM EDT
(65 spots left)
Saturday July 4th 2026
Celebrating Henrietta Swann Leavitt's birthday with telescope views of galaxies.
Reserve
LINK:https://registration.jgap.org/?event=abc4
`.trim();

describe('parseJgapEvents — actual page format (time in title, date on own line)', () => {
  it('parses all events', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    expect(events).toHaveLength(4);
  });

  it('extracts title without time suffix', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    expect(events[0]!.title).toBe('Jupiter and Venus in the West');
    expect(events[2]!.title).toBe('The Bright Moon');
    expect(events[3]!.title).toBe('How Far Are the Galaxies');
  });

  it('converts EDT (UTC-4) to UTC correctly', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    // 8:45 PM EDT = 00:45 UTC next day
    expect(events[0]!.startUtc.toISOString()).toBe('2026-05-23T00:45:00.000Z');
  });

  it('handles 9:00 PM time correctly', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    // 9:00 PM EDT = 01:00 UTC next day
    expect(events[3]!.startUtc.toISOString()).toBe('2026-07-05T01:00:00.000Z');
  });

  it('sets event end 2 hours after start', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    const start = events[0]!.startUtc.getTime();
    const end = events[0]!.endUtc.getTime();
    expect(end - start).toBe(2 * 60 * 60 * 1000);
  });

  it('captures spots from (N spots left) format', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    expect(events[0]!.spotsLeft).toBe(30);
    expect(events[1]!.spotsLeft).toBe(11);
    expect(events[2]!.spotsLeft).toBe(45);
    expect(events[3]!.spotsLeft).toBe(65);
  });

  it('captures per-event registration URLs', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    expect(events[0]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc1');
    expect(events[3]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc4');
  });

  it('captures description text after the date line', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT);
    expect(events[0]!.description).toBe(
      'With Jupiter setting in the west, this week is a good time to get a last look before it is lost in the evening twilight.',
    );
    expect(events[2]!.description).toBe(
      'The nearly full moon lights up our plaza. Come learn how moonlight reveals the true colors of the world.',
    );
  });
});

// Format served as of June 2026: no timezone in title-time, FULL events split across 3 lines
const ACTUAL_PAGE_TEXT_NO_TZ = `
The Low Moon: 9:00 PM
(
FULL
)
Friday June 26th 2026
The titled orbit of the moon sometimes takes it low in the sky.
The Low Moon: 9:00 PM
(
FULL
)
Saturday June 27th 2026
The titled orbit of the moon sometimes takes it low in the sky.
How Far The Galaxies: 9:00 PM
(27 spots left)
Friday July 3rd 2026
This weekend is the birthday of Henrietta Swann Leavitt.
Reserve
LINK:https://registration.jgap.org/?event=abc5
How Far Are the Galaxies: 8:45 PM
(50 spots left)
Saturday July 4th 2026
Leavitt figured out how to determine the incredible distance to the galaxies.
Reserve
LINK:https://registration.jgap.org/?event=abc6
`.trim();

describe('parseJgapEvents — no-timezone format with FULL events', () => {
  it('parses all events including FULL ones', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events).toHaveLength(4);
  });

  it('extracts titles correctly', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events[0]!.title).toBe('The Low Moon');
    expect(events[1]!.title).toBe('The Low Moon');
    expect(events[2]!.title).toBe('How Far The Galaxies');
    expect(events[3]!.title).toBe('How Far Are the Galaxies');
  });

  it('converts 9:00 PM Eastern (no tz, summer→EDT UTC-4) to UTC', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    // 9:00 PM EDT = 21:00 + 4h = 01:00 UTC next day
    expect(events[0]!.startUtc.toISOString()).toBe('2026-06-27T01:00:00.000Z');
    expect(events[1]!.startUtc.toISOString()).toBe('2026-06-28T01:00:00.000Z');
    expect(events[2]!.startUtc.toISOString()).toBe('2026-07-04T01:00:00.000Z');
  });

  it('converts 8:45 PM Eastern (no tz, summer→EDT UTC-4) to UTC', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    // 8:45 PM EDT = 20:45 + 4h = 00:45 UTC next day
    expect(events[3]!.startUtc.toISOString()).toBe('2026-07-05T00:45:00.000Z');
  });

  it('sets spotsLeft to undefined for FULL events', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events[0]!.spotsLeft).toBeUndefined();
    expect(events[1]!.spotsLeft).toBeUndefined();
  });

  it('captures spots for non-full events', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events[2]!.spotsLeft).toBe(27);
    expect(events[3]!.spotsLeft).toBe(50);
  });

  it('captures registration URLs for non-full events', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events[2]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc5');
    expect(events[3]!.registrationUrl).toBe('https://registration.jgap.org/?event=abc6');
  });

  it('sets end 2 hours after start', () => {
    const events = parseJgapEvents(ACTUAL_PAGE_TEXT_NO_TZ);
    expect(events[0]!.endUtc.getTime() - events[0]!.startUtc.getTime()).toBe(2 * 60 * 60 * 1000);
  });
});

describe('CLUBS registry', () => {
  it('includes JGAP', () => {
    const jgap = CLUBS.find((c) => c.id === 'jgap');
    expect(jgap).toBeDefined();
    expect(jgap!.name).toBe('John Glenn Astronomy Park');
    expect(jgap!.scrapeUrl).toBe('https://registration.jgap.org/');
  });

  it('includes CAA with iCal feed', () => {
    const caa = CLUBS.find((c) => c.id === 'caa');
    expect(caa).toBeDefined();
    expect(caa!.location).toBe('Cleveland, OH');
    expect(caa!.scrapeUrl).toContain('cuyastro.org');
    expect(caa!.fetchContent).toBeDefined();
  });

  it('includes AAAP with iCal feed', () => {
    const aaap = CLUBS.find((c) => c.id === 'aaap');
    expect(aaap).toBeDefined();
    expect(aaap!.location).toBe('Pittsburgh, PA');
    expect(aaap!.scrapeUrl).toContain('calendar.google.com');
    expect(aaap!.fetchContent).toBeDefined();
  });

  it('includes TAAA with iCal feed', () => {
    const taaa = CLUBS.find((c) => c.id === 'taaa');
    expect(taaa).toBeDefined();
    expect(taaa!.location).toBe('Tucson, AZ');
    expect(taaa!.scrapeUrl).toContain('tucsonastronomy.org');
    expect(taaa!.fetchContent).toBeDefined();
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

// ---------------------------------------------------------------------------
// iCal parser
// ---------------------------------------------------------------------------

const PITTSBURGH_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
X-WR-TIMEZONE:America/New_York
BEGIN:VEVENT
DTSTART:20260523T223000Z
DTEND:20260524T035900Z
SUMMARY: Wagman Star Party
DESCRIPTION:Dark sky observing at Wagman Observatory.\\nBring a red flashlight.\\n\\nAdditional Info: https://3ap.org/resources/star-parties/
LOCATION:Wagman Observatory\\, Tarentum\\, PA
END:VEVENT
BEGIN:VEVENT
DTSTART:20260508T233000Z
DTEND:20260509T020000Z
SUMMARY:3AP General Meeting
DESCRIPTION:Monthly club meeting.\\n\\nSpeaker TBA
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20260601
DTEND;VALUE=DATE:20260602
SUMMARY:All-day placeholder
END:VEVENT
END:VCALENDAR`.trim();

const TUCSON_ICAL = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Tucson Amateur Astronomy Association//EN
BEGIN:VTIMEZONE
TZID:America/Phoenix
BEGIN:STANDARD
TZOFFSETFROM:-0700
TZOFFSETTO:-0700
TZNAME:MST
DTSTART:20250101T000000
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
DTSTART;TZID=America/Phoenix:20260522T200000
DTEND;TZID=America/Phoenix:20260522T220000
SUMMARY:Stargazing at Saguaro National Park
DESCRIPTION:Star Party open to the public. Free admission.\\nWeather dependent.
URL:https://tucsonastronomy.org/event/stargazing-saguaro-2026/
LOCATION:Saguaro National Park\\, Tucson\\, AZ
END:VEVENT
BEGIN:VEVENT
DTSTART;TZID=America/Phoenix:20260605T190000
DTEND;TZID=America/Phoenix:20260605T210000
SUMMARY:General Meeting – June 2026
DESCRIPTION:Monthly hybrid meeting.
URL:https://tucsonastronomy.org/event/general-meeting-june-2026/
END:VEVENT
END:VCALENDAR`.trim();

describe('parseIcalEvents', () => {
  it('parses UTC timestamps correctly', () => {
    const events = parseIcalEvents(PITTSBURGH_ICAL);
    const wagman = events.find((e) => e.title === 'Wagman Star Party');
    expect(wagman).toBeDefined();
    expect(wagman!.startUtc.toISOString()).toBe('2026-05-23T22:30:00.000Z');
    expect(wagman!.endUtc.toISOString()).toBe('2026-05-24T03:59:00.000Z');
  });

  it('parses TZID=America/Phoenix (UTC-7, no DST) correctly', () => {
    const events = parseIcalEvents(TUCSON_ICAL);
    const starParty = events.find((e) => e.title === 'Stargazing at Saguaro National Park');
    expect(starParty).toBeDefined();
    // 20:00 MST = 20:00 + 7 = 03:00 UTC next day
    expect(starParty!.startUtc.toISOString()).toBe('2026-05-23T03:00:00.000Z');
    expect(starParty!.endUtc.toISOString()).toBe('2026-05-23T05:00:00.000Z');
  });

  it('skips all-day VALUE=DATE events', () => {
    const events = parseIcalEvents(PITTSBURGH_ICAL);
    expect(events.find((e) => e.title === 'All-day placeholder')).toBeUndefined();
  });

  it('strips leading space from SUMMARY', () => {
    const events = parseIcalEvents(PITTSBURGH_ICAL);
    expect(events[0]!.title).toBe('Wagman Star Party');
  });

  it('unescapes \\n in DESCRIPTION', () => {
    const events = parseIcalEvents(PITTSBURGH_ICAL);
    const wagman = events.find((e) => e.title === 'Wagman Star Party');
    expect(wagman!.description).toContain('\n');
  });

  it('captures URL as registrationUrl', () => {
    const events = parseIcalEvents(TUCSON_ICAL);
    const starParty = events.find((e) => e.title === 'Stargazing at Saguaro National Park');
    expect(starParty!.registrationUrl).toBe('https://tucsonastronomy.org/event/stargazing-saguaro-2026/');
  });

  it('sets registrationUrl to undefined when no URL property', () => {
    const events = parseIcalEvents(PITTSBURGH_ICAL);
    const wagman = events.find((e) => e.title === 'Wagman Star Party');
    expect(wagman!.registrationUrl).toBeUndefined();
  });

  it('defaults endUtc to 2 hours after start when no DTEND', () => {
    const ical = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260601T200000Z\nSUMMARY:No End\nEND:VEVENT\nEND:VCALENDAR`;
    const events = parseIcalEvents(ical);
    expect(events[0]!.endUtc.getTime() - events[0]!.startUtc.getTime()).toBe(2 * 60 * 60 * 1000);
  });

  it('handles line folding (continuation lines with leading space)', () => {
    // iCal folds at arbitrary byte positions — the trailing space before the fold is part of the content
    const ical = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:20260601T200000Z\nSUMMARY:A Very Long Title That Gets \n Folded Across Two Lines\nEND:VEVENT\nEND:VCALENDAR`;
    const events = parseIcalEvents(ical);
    expect(events[0]!.title).toBe('A Very Long Title That Gets Folded Across Two Lines');
  });

  it('returns empty array for empty input', () => {
    expect(parseIcalEvents('BEGIN:VCALENDAR\nEND:VCALENDAR')).toHaveLength(0);
  });
});

describe('unescapeIcalText', () => {
  it('converts \\n to newline', () => {
    expect(unescapeIcalText('line1\\nline2')).toBe('line1\nline2');
  });

  it('converts \\, to comma', () => {
    expect(unescapeIcalText('Wagman Observatory\\, PA')).toBe('Wagman Observatory, PA');
  });

  it('strips HTML tags', () => {
    expect(unescapeIcalText('More info: <a href="http://example.com">click here</a>')).toBe('More info: click here');
  });

  it('decodes numeric HTML entities', () => {
    expect(unescapeIcalText('school&#39;s club')).toBe("school's club");
  });

  it('trims leading and trailing whitespace', () => {
    expect(unescapeIcalText(' Wagman Star Party ')).toBe('Wagman Star Party');
  });
});

describe('isUsDst', () => {
  it('returns true in summer (July)', () => {
    expect(isUsDst(new Date(2026, 6, 4))).toBe(true);
  });

  it('returns false in winter (January)', () => {
    expect(isUsDst(new Date(2026, 0, 15))).toBe(false);
  });

  it('returns false before DST starts (March 7, 2026)', () => {
    expect(isUsDst(new Date(2026, 2, 7, 1, 59))).toBe(false);
  });

  it('returns true after DST starts (2nd Sunday March 8, 2026 at 2am)', () => {
    // 2026: March 8 is the 2nd Sunday
    expect(isUsDst(new Date(2026, 2, 8, 2, 0))).toBe(true);
  });

  it('returns false after DST ends (1st Sunday November 1, 2026 at 2am)', () => {
    expect(isUsDst(new Date(2026, 10, 1, 2, 0))).toBe(false);
  });
});

describe('getTzOffsetHours', () => {
  it('returns 7 for America/Phoenix regardless of DST', () => {
    expect(getTzOffsetHours('America/Phoenix', new Date(2026, 6, 4))).toBe(7);
    expect(getTzOffsetHours('America/Phoenix', new Date(2026, 0, 15))).toBe(7);
  });

  it('returns 4 for America/New_York in summer (EDT)', () => {
    expect(getTzOffsetHours('America/New_York', new Date(2026, 6, 4))).toBe(4);
  });

  it('returns 5 for America/New_York in winter (EST)', () => {
    expect(getTzOffsetHours('America/New_York', new Date(2026, 0, 15))).toBe(5);
  });

  it('returns 0 for unknown timezone', () => {
    expect(getTzOffsetHours('America/Unknown', new Date())).toBe(0);
  });
});
