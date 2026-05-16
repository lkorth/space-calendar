import type { CalendarEvent } from '../shared/models.ts';

const PRODID = '-//Space Calendar//EN';
const CRLF = '\r\n';

export function buildICS(events: CalendarEvent[], calName: string): string {
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
    lines.push(`DTSTAMP:${formatDateTime(new Date())}`);
    lines.push(`SUMMARY:${escapeText(event.title)}`);

    if (event.allDay) {
      lines.push(`DTSTART;VALUE=DATE:${formatDate(event.start)}`);
      lines.push(`DTEND;VALUE=DATE:${formatDate(event.end)}`);
    } else {
      lines.push(`DTSTART:${formatDateTime(new Date(event.start))}`);
      lines.push(`DTEND:${formatDateTime(new Date(event.end))}`);
    }

    if (event.description) {
      lines.push(`DESCRIPTION:${escapeText(event.description)}`);
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
