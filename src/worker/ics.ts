import type { CalendarEvent } from '../shared/models.ts';

const PRODID = '-//Space Calendar//EN';
const CRLF = '\r\n';

function formatContactTime(utcISO: string, tz?: string): string {
  if (!tz) return utcISO.slice(11, 16) + ' UTC';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZoneName: 'short',
    }).formatToParts(new Date(utcISO));
    const time = (parts.find((p) => p.type === 'hour')?.value ?? '00') + ':' +
                 (parts.find((p) => p.type === 'minute')?.value ?? '00');
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value ?? 'UTC';
    return `${time} ${tzName}`;
  } catch {
    return utcISO.slice(11, 16) + ' UTC';
  }
}

export function buildICS(events: CalendarEvent[], calName: string, tz?: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${calName}`,
    'X-WR-TIMEZONE:UTC',
  ];

  for (const event of events) {
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${event.uid}`);
    lines.push('TRANSP:TRANSPARENT');
    lines.push(`DTSTAMP:${formatDateTime(new Date())}`);
    lines.push(`SUMMARY:${escapeText(event.title)}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDate(event.end)}`);
    } else {
      lines.push(`DTSTART:${formatDateTime(new Date(event.start))}`);
      lines.push(`DTEND:${formatDateTime(new Date(event.end))}`);
    }

    const descParts: string[] = [];
    if (event.description) descParts.push(event.description);
    if (event.contactTimes && event.contactTimes.length > 0) {
      descParts.push(event.contactTimes.map((ct) => `${ct.label}: ${formatContactTime(ct.utc, tz)}`).join('\n'));
    }
    if (event.pathLocations && event.pathLocations.length > 0) {
      const header = event.title.includes('Annular') ? 'PATH OF ANNULARITY' : 'PATH OF TOTALITY';
      const rows = event.pathLocations.map((loc) => {
        const c2 = formatContactTime(loc.c2UTC, tz);
        const c3 = formatContactTime(loc.c3UTC, tz);
        const mins = Math.floor(loc.durationSec / 60);
        const secs = String(loc.durationSec % 60).padStart(2, '0');
        return `${loc.city}, ${loc.country}: ${c2}–${c3} (${mins}m${secs}s)`;
      });
      descParts.push(`${header}\n${rows.join('\n')}`);
    }
    if (event.url) descParts.push(event.url);
    if (descParts.length > 0) {
      lines.push(`DESCRIPTION:${escapeText(descParts.join('\n\n'))}`);
    }
    if (event.url) {
      lines.push(`URL:${event.url}`);
    }

    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join(CRLF) + CRLF;
}

function formatDateTime(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

function formatDate(iso: string): string {
  return iso.split('T')[0]!.replace(/-/g, '');
}

function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

/** RFC 5545 line folding: lines must not exceed 75 octets */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const result: string[] = [];
  let pos = 0;
  result.push(line.slice(0, 75));
  pos = 75;
  while (pos < line.length) {
    result.push(' ' + line.slice(pos, pos + 74));
    pos += 74;
  }
  return result.join(CRLF);
}
