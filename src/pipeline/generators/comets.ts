import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { fetchComet } from '../clients/jpl.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

interface CometEntry {
  designation: string;
  name: string;
  /** ISO 8601 date of perihelion */
  perihelion: string;
  /** ISO 8601 date of closest Earth approach */
  closestApproach?: string;
  /** ISO 8601 start date of naked-eye visibility window */
  visibilityStart?: string;
  /** ISO 8601 end date of naked-eye visibility window */
  visibilityEnd?: string;
  url: string;
}

export const cometsGenerator: Generator = {
  slug: 'comets',
  schedule: 'weekly',

  async generate(_year: number): Promise<CalendarEvent[]> {
    const raw = readFileSync('comets.yaml', 'utf-8');
    const entries = parse(raw) as CometEntry[];
    const events: CalendarEvent[] = [];

    for (const comet of entries) {
      let jplData;
      try {
        jplData = await fetchComet(comet.designation);
      } catch {
        console.warn(`Could not fetch JPL data for ${comet.designation}`);
      }

      const fullName = jplData?.object.fullname ?? comet.name;
      const orbitClass = jplData?.object.orbit_class.name ?? 'comet';

      // Perihelion event
      const perihelionDt = new Date(comet.perihelion + 'Z');
      events.push({
        uid: `comet-perihelion-${comet.designation.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()}@space-calendar`,
        title: `Comet ${fullName} — Perihelion`,
        start: perihelionDt.toISOString(),
        end: perihelionDt.toISOString(),
        allDay: false,
        description: `${fullName} reaches perihelion — its closest point to the Sun and typically its brightest. This ${orbitClass} is at peak activity around this date. Brightness predictions for comets are notoriously uncertain; it may significantly over- or underperform forecasts.`,
        url: comet.url,
        category: 'comets',
      });

      // Closest Earth approach
      if (comet.closestApproach) {
        const approachDt = new Date(comet.closestApproach + 'Z');
        events.push({
          uid: `comet-approach-${comet.designation.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()}@space-calendar`,
          title: `Comet ${fullName} — Closest Approach to Earth`,
          start: approachDt.toISOString(),
          end: approachDt.toISOString(),
          allDay: false,
          description: `${fullName} makes its closest pass to Earth. This is often (but not always) the best time for naked-eye or binocular viewing, depending on the comet's position relative to the Sun and its activity level.`,
          url: comet.url,
          category: 'comets',
        });
      }

      // Naked-eye visibility window
      if (comet.visibilityStart && comet.visibilityEnd) {
        const endDate = new Date(comet.visibilityEnd + 'T00:00:00Z');
        endDate.setUTCDate(endDate.getUTCDate() + 1);
        events.push({
          uid: `comet-visibility-${comet.designation.replace(/\//g, '-').replace(/\s+/g, '-').toLowerCase()}@space-calendar`,
          title: `Comet ${fullName} — Naked-Eye Visibility Window`,
          start: comet.visibilityStart,
          end: endDate.toISOString().split('T')[0]!,
          allDay: true,
          description: `${fullName} is predicted to be visible to the naked eye or with binoculars during this window. Look for it away from city lights. Actual brightness may vary — comets are famously unpredictable.`,
          url: comet.url,
          category: 'comets',
        });
      }
    }

    return events;
  },
};
