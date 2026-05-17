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

export const alignmentsGenerator: Generator = {
  slug: 'alignments',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('alignments.yaml', 'utf-8');
    const entries = (parse(raw) as AlignmentEntry[] | null) ?? [];

    const ALIGNMENT_EMOJI: Record<string, string> = {
      'mars-launch-window': '🚀',
      'planet-parade': '🌟',
    };

    return filterByYear(entries, year).map((e) => ({
      uid: `alignment-${e.type}-${e.start}@space-calendar`,
      title: `${ALIGNMENT_EMOJI[e.type] ?? '🌟'} ${e.title}`,
      start: e.start,
      end: e.end,
      allDay: true,
      description: e.description.trim(),
      url: e.url,
      category: 'alignments' as const,
    }));
  },
};
