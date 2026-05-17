import { ANNUAL_SHOWERS } from '../clients/ams.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

export const meteorShowersGenerator: Generator = {
  slug: 'meteor-showers',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    return ANNUAL_SHOWERS.map((shower) => {
      const date = new Date(Date.UTC(year, shower.peakMonth - 1, shower.peakDay));
      const dateStr = date.toISOString().split('T')[0]!;
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0]!;

      return {
        uid: `meteor-shower-${shower.name.toLowerCase().replace(/\s+/g, '-')}-${year}@space-calendar`,
        title: `🌠 ${shower.name} Meteor Shower — Peak Night`,
        start: dateStr,
        end: nextDayStr,
        allDay: true,
        description: [
          `The ${shower.name} meteor shower reaches its peak tonight, produced by debris left behind by ${shower.parentBody} as Earth passes through its orbital trail.`,
          `Under ideal dark-sky conditions, observers can expect up to ${shower.zhr} meteors per hour (ZHR). Meteors radiate from the constellation ${shower.radiant} but can appear anywhere in the sky. No equipment needed — just a dark location, a reclining chair, and patience. The best viewing is typically after midnight when the radiant is highest.`,
        ].join('\n\n'),
        url: shower.url,
        category: 'meteor-showers',
      };
    });
  },
};
