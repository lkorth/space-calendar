import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

interface AlignmentEntry {
  start: string;
  end: string;
  type: 'mars-launch-window' | 'planet-parade';
  title: string;
  description: string;
  url: string;
}

/** Filter entries that overlap the given year */
export function filterByYear(entries: AlignmentEntry[], year: number): AlignmentEntry[] {
  return entries.filter((e) => {
    const startYear = parseInt(e.start.slice(0, 4), 10);
    const endYear = parseInt(e.end.slice(0, 4), 10);
    return startYear <= year && endYear >= year;
  });
}

function nextDayStr(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0]!;
}

/** Format a YYYY-MM-DD string as "Month D, YYYY" (e.g. "November 1, 2026") */
export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

const ALIGNMENT_EMOJI: Record<string, string> = {
  'mars-launch-window': '🚀',
  'planet-parade': '🌟',
};

export function entryToEvent(e: AlignmentEntry): CalendarEvent {
  const isMarsWindow = e.type === 'mars-launch-window';
  const eventEnd = isMarsWindow ? nextDayStr(e.start) : e.end;
  const description = isMarsWindow
    ? `Launch window: ${formatDate(e.start)} – ${formatDate(e.end)}\n\n${e.description.trim()}`
    : e.description.trim();
  return {
    uid: `alignment-${e.type}-${e.start}@space-calendar`,
    title: `${ALIGNMENT_EMOJI[e.type] ?? '🌟'} ${e.title}`,
    start: e.start,
    end: eventEnd,
    allDay: true,
    description,
    url: e.url,
    category: 'alignments' as const,
  };
}

export const alignmentsGenerator: Generator = {
  slug: 'alignments',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('alignments.yaml', 'utf-8');
    const entries = (parse(raw) as AlignmentEntry[] | null) ?? [];
    return filterByYear(entries, year).map(entryToEvent);
  },
};
