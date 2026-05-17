import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

interface ConjunctionEntry {
  date: string;
  bodies: [string, string];
  separation: number;
  sky: 'evening' | 'morning';
  look: string;
  mag1: number;
  mag2: number;
  description: string;
  url: string;
}

/** Format a visual magnitude for display (e.g. -4.5 → "−4.5", 1.2 → "+1.2") */
export function formatMag(mag: number): string {
  return mag < 0 ? `−${Math.abs(mag).toFixed(1)}` : `+${mag.toFixed(1)}`;
}

/** Build the event title for a conjunction */
export function buildConjunctionTitle(bodies: [string, string], separationDeg: number): string {
  const sep = separationDeg.toFixed(1);
  return `✨ Planetary Conjunction — ${bodies[0]} & ${bodies[1]} (${sep}° apart)`;
}

/** Filter entries to a given year */
export function filterByYear(entries: ConjunctionEntry[], year: number): ConjunctionEntry[] {
  return entries.filter((e) => e.date.startsWith(String(year)));
}

export const conjunctionsGenerator: Generator = {
  slug: 'conjunctions',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('conjunctions.yaml', 'utf-8');
    const entries = (parse(raw) as ConjunctionEntry[] | null) ?? [];

    return filterByYear(entries, year).map((e) => {
      const start = new Date(e.date + 'T00:00:00Z');
      const end = new Date(e.date + 'T00:00:00Z');
      end.setUTCDate(end.getUTCDate() + 1);

      const [b1, b2] = e.bodies;
      const description = [
        `${b1} (magnitude ${formatMag(e.mag1)}) and ${b2} (magnitude ${formatMag(e.mag2)}) appear just ${e.separation.toFixed(1)}° apart — close enough to fit within a single binocular field of view. ${e.look}.`,
        e.description.trim(),
      ].join('\n\n');

      return {
        uid: `conjunction-${b1!.toLowerCase()}-${b2!.toLowerCase()}-${e.date}@space-calendar`,
        title: buildConjunctionTitle(e.bodies, e.separation),
        start: e.date,
        end: end.toISOString().split('T')[0]!,
        allDay: true,
        description,
        url: e.url,
        category: 'conjunctions' as const,
      };
    });
  },
};
