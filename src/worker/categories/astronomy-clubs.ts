import type { CalendarEvent } from '../../shared/models.ts';
import type { Category, Env, RequestParams } from '../types.ts';

const TTL_SECONDS = 60 * 60 * 6; // 6 hours

export interface Club {
  id: string;
  name: string;
  location: string;
  websiteUrl: string;
  scrapeUrl: string;
  parseEvents: (text: string) => ParsedEvent[];
}

export interface ParsedEvent {
  title: string;
  startUtc: Date;
  endUtc: Date;
  description?: string;
  spotsLeft?: number;
  registrationUrl?: string;
}

// ---------------------------------------------------------------------------
// JGAP parser
// ---------------------------------------------------------------------------

const DAYS = 'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday';
const MONTHS_RE = 'January|February|March|April|May|June|July|August|September|October|November|December';
const DATE_TIME_RE = new RegExp(
  `\\b(?:${DAYS}),?\\s+(${MONTHS_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b` +
  `[^\\n]*?\\bat\\s+(\\d{1,2}):(\\d{2})\\s*(AM|PM)\\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST)\\b`,
  'i',
);

const TZ_OFFSETS: Record<string, number> = {
  EDT: -4, EST: -5, CDT: -5, CST: -6, MDT: -6, MST: -7, PDT: -7, PST: -8,
};

const MONTH_INDEX: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

// Lines to skip when scanning backward for an event title
const SKIP_LINE_RE = /^(?:reserve|back|next|home|about|login|register|sign\s*in|\d+\s+spots?|loading|©|\(?\d+\s+spots?\)?|programs?\s*&|programs?\s*and|LINK:)/i;

export function parseJgapEvents(text: string): ParsedEvent[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const events: ParsedEvent[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;

    const match = line.match(DATE_TIME_RE);
    if (!match) continue;

    const [, monthStr, dayStr, yearStr, hourStr, minuteStr, ampm, tzStr] = match;

    const month = MONTH_INDEX[monthStr!.toLowerCase()];
    if (month === undefined) continue;

    const day = parseInt(dayStr!);
    const year = parseInt(yearStr!);
    let hour = parseInt(hourStr!);
    const minute = parseInt(minuteStr!);

    if (ampm!.toUpperCase() === 'PM' && hour !== 12) hour += 12;
    else if (ampm!.toUpperCase() === 'AM' && hour === 12) hour = 0;

    const tzOffset = TZ_OFFSETS[tzStr!.toUpperCase()] ?? 0;
    const startUtc = new Date(Date.UTC(year, month, day, hour - tzOffset, minute));
    const endUtc = new Date(startUtc.getTime() + 2 * 60 * 60 * 1000);

    // Spots may appear inline at end of date line: "(30 spots)"
    let spotsLeft: number | undefined;
    const inlineSpots = line.match(/\((\d+)\s+spots?\)/i);
    if (inlineSpots) spotsLeft = parseInt(inlineSpots[1]!);

    // Find title: check for text before the day-of-week on this line, then scan back
    let title: string | null = null;

    const dayOfWeekIndex = line.search(new RegExp(`\\b(?:${DAYS})\\b`, 'i'));
    if (dayOfWeekIndex > 0) {
      const before = line.slice(0, dayOfWeekIndex).replace(/[\s–—\-]+$/, '').trim();
      if (before.length > 1) title = before;
    }

    if (!title) {
      for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
        const candidate = lines[j]!;
        // Capture spots if not already found inline
        if (spotsLeft === undefined) {
          const spotsMatch = candidate.match(/^(\d+)\s+spots?/i);
          if (spotsMatch) { spotsLeft = parseInt(spotsMatch[1]!); continue; }
        }
        if (!SKIP_LINE_RE.test(candidate) && candidate.length > 2) {
          title = candidate;
          break;
        }
      }
    }

    if (!title) continue;

    // Scan forward: collect description text and reservation URL.
    // Structure: date line → description lines → "Reserve" → LINK:URL → next event
    const descLines: string[] = [];
    let registrationUrl: string | undefined;
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
      const fwd = lines[j]!;
      const linkMatch = fwd.match(/^LINK:(.+)$/);
      if (linkMatch) { registrationUrl = linkMatch[1]!.trim(); break; }
      if (/^reserve$/i.test(fwd)) continue; // skip button text, keep scanning for LINK:
      if (DATE_TIME_RE.test(fwd)) break;    // hit the next event's date, stop
      if (fwd.length > 2) descLines.push(fwd);
    }
    const description = descLines.length > 0 ? descLines.join(' ') : undefined;

    events.push({ title, startUtc, endUtc, description, spotsLeft, registrationUrl });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Club registry
// ---------------------------------------------------------------------------

export const CLUBS: Club[] = [
  {
    id: 'jgap',
    name: 'John Glenn Astronomy Park',
    location: 'New Concord, OH',
    websiteUrl: 'https://jgap.info/',
    scrapeUrl: 'https://registration.jgap.org/',
    parseEvents: parseJgapEvents,
  },
];

// ---------------------------------------------------------------------------
// Page text extraction — preserves <a href> URLs as LINK: markers
// ---------------------------------------------------------------------------

async function fetchPageText(url: string): Promise<string> {
  const response = await fetch(url);
  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Preserve anchor hrefs: <a href="URL">text</a> → "text\nLINK:URL"
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, content) => {
      const text = content.replace(/<[^>]+>/g, '').trim();
      return text ? `${text}\nLINK:${href}` : `LINK:${href}`;
    })
    .replace(/<[^>]+>/g, '\n')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n');
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export const astronomyClubsCategory: Category = {
  slug: 'astronomy-clubs',

  async fetch(env: Env, params: RequestParams): Promise<CalendarEvent[]> {
    const club = CLUBS.find((c) => c.id === params.club);
    if (!club) return [];

    const kvKey = `astronomy-clubs:${club.id}`;
    const cached = await env.CALENDAR_KV.get(kvKey);
    if (cached) return JSON.parse(cached) as CalendarEvent[];

    const text = await fetchPageText(club.scrapeUrl);
    const parsed = club.parseEvents(text);
    const events: CalendarEvent[] = parsed.map((p) => ({
      uid: `astronomy-club-${club.id}-${p.startUtc.toISOString()}@space-calendar`,
      title: `🔭 ${p.title}`,
      start: p.startUtc.toISOString(),
      end: p.endUtc.toISOString(),
      allDay: false,
      description: buildDescription(club, p),
      url: p.registrationUrl ?? club.scrapeUrl,
      category: 'astronomy-clubs',
    }));

    await env.CALENDAR_KV.put(kvKey, JSON.stringify(events), {
      expirationTtl: TTL_SECONDS,
    });
    return events;
  },
};

function buildDescription(club: Club, p: ParsedEvent): string {
  const parts: string[] = [];
  if (p.description) parts.push(p.description);
  parts.push(`Public program at ${club.name} in ${club.location}.`);
  if (p.spotsLeft !== undefined) {
    parts.push(`${p.spotsLeft} spot${p.spotsLeft === 1 ? '' : 's'} remaining.`);
  }
  parts.push(`Reserve your spot: ${p.registrationUrl ?? club.scrapeUrl}`);
  return parts.join('\n\n');
}
