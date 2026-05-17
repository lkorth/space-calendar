import { usno } from '../clients/usno.ts';
import type { CalendarEvent, Generator } from '../../shared/models.ts';

const PHASE_LABELS: Record<string, string> = {
  'New Moon': 'New Moon',
  'Full Moon': 'Full Moon',
};

export const moonPhasesGenerator: Generator = {
  slug: 'moon-phases',
  schedule: 'annual',

  async generate(year: number): Promise<CalendarEvent[]> {
    const data = await usno.moonPhases(year);
    return data.phasedata.filter((phase) => phase.phase === 'New Moon' || phase.phase === 'Full Moon').map((phase) => {
      const label = PHASE_LABELS[phase.phase] ?? phase.phase;
      const dt = new Date(`${phase.year}-${String(phase.month).padStart(2, '0')}-${String(phase.day).padStart(2, '0')}T${phase.time}:00Z`);
      return {
        uid: `moon-phase-${dt.toISOString()}@space-calendar`,
        title: label,
        start: dt.toISOString(),
        end: dt.toISOString(),
        allDay: false,
        description: describePhase(phase.phase),
        url: 'https://aa.usno.navy.mil/data/MoonPhases',
        category: 'moon-phases',
      };
    });
  },
};

function describePhase(phase: string): string {
  switch (phase) {
    case 'New Moon':
      return 'The Moon is between Earth and the Sun, with its illuminated side facing away from us. The night sky is at its darkest — ideal for deep-sky observing. New moons also mark the start of each lunar cycle.';
    case 'Full Moon':
      return 'The Moon rises at sunset and is visible all night, fully illuminated by the Sun. The bright light washes out fainter stars and deep-sky objects, but the Moon itself is a spectacular sight — especially near the horizon due to the Moon illusion.';
    default:
      return '';
  }
}
