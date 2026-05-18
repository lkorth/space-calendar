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
  /** Custom fetcher; defaults to fetchPageText (HTML scraping). Use for iCal feeds. */
  fetchContent?: (url: string) => Promise<string>;
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

// Actual page format: date-only line (no time), e.g. "Friday May 22nd 2026"
const DATE_ONLY_RE = new RegExp(
  `^(?:${DAYS})\\s+(${MONTHS_RE})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})$`,
  'i',
);

// Matches a title line with time embedded at the end, e.g. "Jupiter: 8:45 PM EDT"
const TITLE_TIME_RE = /^(.*?):\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*(EDT|EST|CDT|CST|MDT|MST|PDT|PST)\s*$/i;

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

    const dtMatch = line.match(DATE_TIME_RE);
    if (dtMatch) {
      // --- Legacy format: date and time on the same line ---
      const [, monthStr, dayStr, yearStr, hourStr, minuteStr, ampm, tzStr] = dtMatch;

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

      let spotsLeft: number | undefined;
      const inlineSpots = line.match(/\((\d+)\s+spots?\)/i);
      if (inlineSpots) spotsLeft = parseInt(inlineSpots[1]!);

      let title: string | null = null;
      const dayOfWeekIndex = line.search(new RegExp(`\\b(?:${DAYS})\\b`, 'i'));
      if (dayOfWeekIndex > 0) {
        const before = line.slice(0, dayOfWeekIndex).replace(/[\s–—\-]+$/, '').trim();
        if (before.length > 1) title = before;
      }
      if (!title) {
        for (let j = i - 1; j >= Math.max(0, i - 5); j--) {
          const candidate = lines[j]!;
          if (spotsLeft === undefined) {
            const spotsMatch = candidate.match(/^(\d+)\s+spots?/i);
            if (spotsMatch) { spotsLeft = parseInt(spotsMatch[1]!); continue; }
          }
          if (!SKIP_LINE_RE.test(candidate) && candidate.length > 2) { title = candidate; break; }
        }
      }
      if (!title) continue;

      const descLines: string[] = [];
      let registrationUrl: string | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const fwd = lines[j]!;
        const linkMatch = fwd.match(/^LINK:(.+)$/);
        if (linkMatch) { registrationUrl = linkMatch[1]!.trim(); break; }
        if (/^reserve$/i.test(fwd)) continue;
        if (DATE_TIME_RE.test(fwd)) break;
        if (fwd.length > 2) descLines.push(fwd);
      }
      const description = descLines.length > 0 ? descLines.join(' ') : undefined;
      events.push({ title, startUtc, endUtc, description, spotsLeft, registrationUrl });
      continue;
    }

    // --- Actual page format: "Title: HH:MM PM TZ" / "(N spots left)" / "Day Month DDth YYYY" ---
    const dateOnlyMatch = line.match(DATE_ONLY_RE);
    if (dateOnlyMatch) {
      const [, dMonthStr, dDayStr, dYearStr] = dateOnlyMatch;
      const dMonth = MONTH_INDEX[dMonthStr!.toLowerCase()];
      if (dMonth === undefined) continue;
      const dDay = parseInt(dDayStr!);
      const dYear = parseInt(dYearStr!);

      let dTitle: string | null = null;
      let dHour = 0;
      let dMinute = 0;
      let dTzOffset = 0;
      let dSpotsLeft: number | undefined;

      for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
        const candidate = lines[j]!;
        const spotsMatch = candidate.match(/^\(?(\d+)\s+spots?\s*(?:left)?\)?$/i);
        if (spotsMatch) { dSpotsLeft = parseInt(spotsMatch[1]!); continue; }
        const ttMatch = candidate.match(TITLE_TIME_RE);
        if (ttMatch) {
          const [, rawTitle, hStr, mStr, ap, tz] = ttMatch;
          dTitle = rawTitle!.trim();
          dHour = parseInt(hStr!);
          dMinute = parseInt(mStr!);
          if (ap!.toUpperCase() === 'PM' && dHour !== 12) dHour += 12;
          else if (ap!.toUpperCase() === 'AM' && dHour === 12) dHour = 0;
          dTzOffset = TZ_OFFSETS[tz!.toUpperCase()] ?? 0;
          break;
        }
        if (SKIP_LINE_RE.test(candidate)) continue;
        break;
      }

      if (!dTitle) continue;

      const dStart = new Date(Date.UTC(dYear, dMonth, dDay, dHour - dTzOffset, dMinute));
      const dEnd = new Date(dStart.getTime() + 2 * 60 * 60 * 1000);

      const dDescLines: string[] = [];
      let dRegistrationUrl: string | undefined;
      for (let j = i + 1; j < Math.min(lines.length, i + 12); j++) {
        const fwd = lines[j]!;
        const linkMatch = fwd.match(/^LINK:(.+)$/);
        if (linkMatch) { dRegistrationUrl = linkMatch[1]!.trim(); break; }
        if (/^reserve$/i.test(fwd)) continue;
        if (DATE_ONLY_RE.test(fwd) || TITLE_TIME_RE.test(fwd)) break;
        if (SKIP_LINE_RE.test(fwd)) continue;
        if (fwd.length > 2) dDescLines.push(fwd);
      }
      const dDescription = dDescLines.length > 0 ? dDescLines.join(' ') : undefined;

      events.push({ title: dTitle, startUtc: dStart, endUtc: dEnd, description: dDescription, spotsLeft: dSpotsLeft, registrationUrl: dRegistrationUrl });
    }
  }

  return events;
}

// ---------------------------------------------------------------------------
// iCal parser (shared by iCal-feed clubs)
// ---------------------------------------------------------------------------

export async function fetchIcalText(url: string): Promise<string> {
  const response = await fetch(url);
  return response.text();
}

function unfoldIcal(raw: string): string[] {
  return raw.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

interface IcalProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseIcalLine(line: string): IcalProp | null {
  const colonIdx = line.indexOf(':');
  if (colonIdx === -1) return null;
  const parts = line.slice(0, colonIdx).split(';');
  const name = parts[0]!.toUpperCase();
  const params: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq !== -1) params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1);
  }
  return { name, params, value: line.slice(colonIdx + 1) };
}

export function unescapeIcalText(s: string): string {
  return s
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(parseInt(code)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .trim();
}

// True if the given local date falls within US DST (2nd Sun Mar → 1st Sun Nov)
export function isUsDst(d: Date): boolean {
  const month = d.getMonth() + 1;
  if (month < 3 || month > 11) return false;
  if (month > 3 && month < 11) return true;
  const dom = d.getDate();
  if (month === 3) {
    const secondSun = 8 + ((7 - new Date(d.getFullYear(), 2, 8).getDay()) % 7);
    return dom > secondSun || (dom === secondSun && d.getHours() >= 2);
  }
  const firstSun = 1 + ((7 - new Date(d.getFullYear(), 10, 1).getDay()) % 7);
  return dom < firstSun || (dom === firstSun && d.getHours() < 2);
}

// Returns the UTC offset to subtract (positive = west of UTC) for a given IANA timezone
export function getTzOffsetHours(tzid: string, localDate: Date): number {
  switch (tzid) {
    case 'America/Phoenix': return 7;
    case 'America/New_York': return isUsDst(localDate) ? 4 : 5;
    case 'America/Chicago': return isUsDst(localDate) ? 5 : 6;
    case 'America/Denver': return isUsDst(localDate) ? 6 : 7;
    case 'America/Los_Angeles': return isUsDst(localDate) ? 7 : 8;
    default: return 0;
  }
}

function parseIcalDatetime(value: string, tzid?: string): Date | null {
  const utcMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [, y, mo, d, h, mi, s] = utcMatch;
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h!, +mi!, +s!));
  }
  const localMatch = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch && tzid) {
    const [, y, mo, d, h, mi, s] = localMatch;
    const local = new Date(+y!, +mo! - 1, +d!, +h!, +mi!, +s!);
    const offset = getTzOffsetHours(tzid, local);
    return new Date(Date.UTC(+y!, +mo! - 1, +d!, +h! + offset, +mi!, +s!));
  }
  return null;
}

function buildIcalEvent(props: IcalProp[]): ParsedEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const dtStartProp = get('DTSTART');
  if (!dtStartProp || dtStartProp.params['VALUE'] === 'DATE') return null;
  const tzid = dtStartProp.params['TZID'];
  const startUtc = parseIcalDatetime(dtStartProp.value, tzid);
  if (!startUtc) return null;
  const dtEndProp = get('DTEND');
  const endUtc = dtEndProp
    ? (parseIcalDatetime(dtEndProp.value, dtEndProp.params['TZID'] ?? tzid) ?? new Date(startUtc.getTime() + 2 * 60 * 60 * 1000))
    : new Date(startUtc.getTime() + 2 * 60 * 60 * 1000);
  const summaryProp = get('SUMMARY');
  const title = summaryProp ? unescapeIcalText(summaryProp.value) : '';
  if (!title) return null;
  const descProp = get('DESCRIPTION');
  const description = descProp ? unescapeIcalText(descProp.value) || undefined : undefined;
  const urlProp = get('URL');
  const registrationUrl = urlProp ? unescapeIcalText(urlProp.value) || undefined : undefined;
  return { title, startUtc, endUtc, description, registrationUrl };
}

export function parseIcalEvents(ical: string): ParsedEvent[] {
  const lines = unfoldIcal(ical);
  const events: ParsedEvent[] = [];
  let inEvent = false;
  let props: IcalProp[] = [];
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { inEvent = true; props = []; }
    else if (line === 'END:VEVENT') { inEvent = false; const e = buildIcalEvent(props); if (e) events.push(e); }
    else if (inEvent) { const p = parseIcalLine(line); if (p) props.push(p); }
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
  {
    id: 'aaap',
    name: 'Amateur Astronomers Association of Pittsburgh',
    location: 'Pittsburgh, PA',
    websiteUrl: 'https://3ap.org/',
    scrapeUrl: 'https://calendar.google.com/calendar/ical/3ap.org_m26d3j8q8gi9m4lupr5ta4d3rg@group.calendar.google.com/public/basic.ics',
    parseEvents: parseIcalEvents,
    fetchContent: fetchIcalText,
  },
  {
    id: 'taaa',
    name: 'Tucson Amateur Astronomy Association',
    location: 'Tucson, AZ',
    websiteUrl: 'https://tucsonastronomy.org/',
    scrapeUrl: 'https://tucsonastronomy.org/?ical=1&tribe_display=list',
    parseEvents: parseIcalEvents,
    fetchContent: fetchIcalText,
  },
];

// ---------------------------------------------------------------------------
// Page text extraction — preserves <a href> URLs as LINK: markers
// ---------------------------------------------------------------------------

export async function fetchPageText(url: string): Promise<string> {
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

    const text = await (club.fetchContent ?? fetchPageText)(club.scrapeUrl);
    const cutoff = new Date();
    cutoff.setUTCMonth(cutoff.getUTCMonth() - 6);
    const parsed = club.parseEvents(text).filter((p) => p.startUtc >= cutoff);
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
  if (p.registrationUrl) {
    parts.push(`Reserve your spot: ${p.registrationUrl}`);
  } else {
    parts.push(`More info: ${club.websiteUrl}`);
  }
  return parts.join('\n\n');
}
