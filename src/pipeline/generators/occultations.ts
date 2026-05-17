import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

interface OccultationEntry {
  date: string;
  target: string;
  type: 'planet' | 'star';
  magnitude: number;
  visibility: string;
  disappear: string;
  reappear?: string;
  description: string;
  url: string;
}

export const occultationsGenerator: Generator = {
  slug: 'occultations',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('occultations.yaml', 'utf-8');
    const entries = (parse(raw) as OccultationEntry[] | null) ?? [];

    return entries
      .filter((e) => e.date.startsWith(String(year)))
      .map((e) => {
        const startDt = new Date(`${e.date}T${e.disappear}:00Z`);
        const endDt = e.reappear
          ? new Date(`${e.date}T${e.reappear}:00Z`)
          : new Date(startDt.getTime() + 60 * 60 * 1000); // default 1-hour window

        const targetLabel = e.type === 'planet' ? e.target : `the star ${e.target}`;
        const title =
          e.type === 'planet'
            ? `Lunar Occultation — Moon covers ${e.target}`
            : `Lunar Occultation — Moon covers ${e.target}`;

        const description = [
          `The Moon passes directly in front of ${targetLabel} (magnitude ${e.magnitude > 0 ? '+' : ''}${e.magnitude.toFixed(1)}), briefly hiding it from view. This is a lunar occultation — one of the most dramatic naked-eye astronomical events, since the target disappears almost instantaneously behind the Moon's limb and reappears just as suddenly.`,
          e.description.trim(),
          `Visible from: ${e.visibility}.`,
          `Disappears: ${e.disappear} UTC${e.reappear ? `\nReappears: ${e.reappear} UTC` : ''}`,
        ].join('\n\n');

        return {
          uid: `occultation-${e.target.toLowerCase().replace(/\s+/g, '-')}-${e.date}@space-calendar`,
          title,
          start: startDt.toISOString(),
          end: endDt.toISOString(),
          allDay: false,
          description,
          url: e.url,
          category: 'occultations' as const,
        };
      });
  },
};

/** Pure helper: build event title for an occultation entry (exported for testing) */
export function buildOccultationTitle(target: string): string {
  return `Lunar Occultation — Moon covers ${target}`;
}

/** Pure helper: filter entries to a given year (exported for testing) */
export function filterByYear(entries: OccultationEntry[], year: number): OccultationEntry[] {
  return entries.filter((e) => e.date.startsWith(String(year)));
}
