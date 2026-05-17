import { usno } from '../clients/usno.ts';
import type { MoonPhase } from '../clients/usno.ts';
import { ANNUAL_SHOWERS } from '../clients/ams.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

export function moonPhaseOnDate(dateStr: string, phases: MoonPhase[]): { illumination: number; isWaxing: boolean } {
  const targetMs = new Date(dateStr + 'T12:00:00Z').getTime();
  const newMoonMs = phases
    .filter((p) => p.phase === 'New Moon')
    .map((p) => Date.UTC(p.year, p.month - 1, p.day))
    .sort((a, b) => a - b);

  let prevNewMoon: number | undefined;
  let nextNewMoon: number | undefined;
  for (const t of newMoonMs) {
    if (t <= targetMs) prevNewMoon = t;
    else if (nextNewMoon === undefined) nextNewMoon = t;
  }

  let daysSinceNew: number;
  let cycleLength: number;

  if (prevNewMoon !== undefined && nextNewMoon !== undefined) {
    cycleLength = (nextNewMoon - prevNewMoon) / 86400000;
    daysSinceNew = (targetMs - prevNewMoon) / 86400000;
  } else if (prevNewMoon !== undefined) {
    cycleLength = 29.530589;
    daysSinceNew = (targetMs - prevNewMoon) / 86400000;
  } else if (nextNewMoon !== undefined) {
    // Before the first new moon of the year — count back from it
    cycleLength = 29.530589;
    daysSinceNew = cycleLength - (nextNewMoon - targetMs) / 86400000;
  } else {
    return { illumination: 0, isWaxing: true };
  }

  const fraction = Math.max(0, Math.min(1, daysSinceNew / cycleLength));
  const illumination = Math.round((1 - Math.cos(fraction * 2 * Math.PI)) / 2 * 100);
  return { illumination, isWaxing: fraction < 0.5 };
}

export function moonViewingNote(illumination: number, isWaxing: boolean): string {
  if (illumination >= 90) {
    return `MOON CONDITIONS: ${illumination}% illuminated — near full moon. Bright moonlight will significantly reduce visible meteor counts. Look for bright fireballs that cut through the glare.`;
  }
  if (illumination <= 10) {
    return `MOON CONDITIONS: ${illumination}% illuminated — near new moon. Dark skies all night make this an excellent year for this shower.`;
  }
  if (isWaxing) {
    if (illumination <= 40) {
      return `MOON CONDITIONS: ${illumination}% illuminated (waxing crescent) — sets a few hours after dark. The post-midnight viewing window is dark, right when the radiant is highest.`;
    }
    if (illumination <= 65) {
      return `MOON CONDITIONS: ${illumination}% illuminated (near first quarter) — sets around midnight. Conditions improve significantly in the second half of the night.`;
    }
    return `MOON CONDITIONS: ${illumination}% illuminated (waxing gibbous) — bright for most of the night. The pre-dawn hours offer the best window as the moon descends toward the horizon.`;
  } else {
    if (illumination >= 65) {
      return `MOON CONDITIONS: ${illumination}% illuminated (waning gibbous) — rises in the late evening. The first hours after dark offer the best viewing before moonrise.`;
    }
    if (illumination >= 40) {
      return `MOON CONDITIONS: ${illumination}% illuminated (near last quarter) — rises around midnight. Evening hours are best before the moon climbs.`;
    }
    return `MOON CONDITIONS: ${illumination}% illuminated (waning crescent) — rises a few hours before dawn. Good viewing from dusk until moonrise.`;
  }
}

export const meteorShowersGenerator: Generator = {
  slug: 'meteor-showers',
  schedule: 'monthly',

  async generate(year: number): Promise<CalendarEvent[]> {
    const { phasedata } = await usno.moonPhases(year);

    return ANNUAL_SHOWERS.map((shower) => {
      const date = new Date(Date.UTC(year, shower.peakMonth - 1, shower.peakDay));
      const dateStr = date.toISOString().split('T')[0]!;
      const nextDay = new Date(date);
      nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0]!;

      const { illumination, isWaxing } = moonPhaseOnDate(dateStr, phasedata);

      return {
        uid: `meteor-shower-${shower.name.toLowerCase().replace(/\s+/g, '-')}-${year}@space-calendar`,
        title: `🌠 ${shower.name} Meteor Shower — Peak Night`,
        start: dateStr,
        end: nextDayStr,
        allDay: true,
        description: [
          `The ${shower.name} meteor shower reaches its peak tonight, produced by debris left behind by ${shower.parentBody} as Earth passes through its orbital trail.`,
          `Under ideal dark-sky conditions, observers can expect up to ${shower.zhr} meteors per hour (ZHR). Meteors radiate from the constellation ${shower.radiant} but can appear anywhere in the sky. No equipment needed — just a dark location, a reclining chair, and patience. The best viewing is typically after midnight when the radiant is highest.`,
          moonViewingNote(illumination, isWaxing),
        ].join('\n\n'),
        url: shower.url,
        category: 'meteor-showers',
      };
    });
  },
};
