import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

interface HistoryEntry {
  date: string;
  title: string;
  description: string;
  url: string;
}

const MILESTONE_INTERVALS = [20, 25, 50, 75, 100];

export const historyGenerator: Generator = {
  slug: 'history',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('history.yaml', 'utf-8');
    const entries = (parse(raw) as HistoryEntry[] | null) ?? [];
    const events: CalendarEvent[] = [];

    for (const entry of entries) {
      const originalYear = parseInt(entry.date.split('-')[0]!, 10);
      const age = year - originalYear;
      if (!MILESTONE_INTERVALS.includes(age)) continue;

      const [, month, day] = entry.date.split('-') as [string, string, string];
      const anniversaryDate = `${year}-${month}-${day}`;
      const nextDay = new Date(anniversaryDate + 'T00:00:00Z');
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);

      events.push({
        uid: `history-${entry.date.replace(/-/g, '')}@space-calendar`,
        title: `${age} Years Ago: ${entry.title} (${originalYear})`,
        start: anniversaryDate,
        end: nextDay.toISOString().split('T')[0]!,
        allDay: true,
        description: entry.description,
        url: entry.url,
        category: 'history',
      });
    }

    return events;
  },
};
