/**
 * Pipeline orchestrator. Run via:
 *   npm run pipeline                  — all generators
 *   npm run pipeline:monthly          — monthly schedule only
 *   npm run pipeline:weekly           — weekly schedule only
 *   tsx src/pipeline/run.ts --generator moon-phases
 *   tsx src/pipeline/run.ts --year 2027
 *   tsx src/pipeline/run.ts --wall-calendar   — only data/wall-calendar-events.json
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { WALL_CALENDAR_CATEGORIES } from '../shared/wall-calendar/events.ts';
import { wallCalendarYears, selectWallCalendarEvents } from './wall-calendar-events.ts';
import type { CalendarEvent, Generator } from '../shared/models.ts';

import { moonPhasesGenerator } from './generators/moon-phases.ts';
import { meteorShowersGenerator } from './generators/meteor-showers.ts';
import { solarEclipsesGenerator, lunarEclipsesGenerator } from './generators/eclipses.ts';
import { solsticesEquinoxesGenerator } from './generators/solstices-equinoxes.ts';
import { oppositionsGenerator, elongationsGenerator } from './generators/planetary.ts';
import { asteroidsGenerator } from './generators/asteroids.ts';
import { historyGenerator } from './generators/history.ts';
import { cometsGenerator } from './generators/comets.ts';
import { occultationsGenerator } from './generators/occultations.ts';
import { conjunctionsGenerator } from './generators/conjunctions.ts';
import { alignmentsGenerator } from './generators/alignments.ts';
import { deepSkyGenerator } from './generators/deep-sky.ts';

const ALL_GENERATORS: Generator[] = [
  moonPhasesGenerator,
  meteorShowersGenerator,
  solarEclipsesGenerator,
  lunarEclipsesGenerator,
  solsticesEquinoxesGenerator,
  oppositionsGenerator,
  elongationsGenerator,
  asteroidsGenerator,
  historyGenerator,
  cometsGenerator,
  occultationsGenerator,
  conjunctionsGenerator,
  alignmentsGenerator,
  deepSkyGenerator,
];

function parseArgs(): { schedule?: string; generator?: string; year?: number } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  const yearStr = get('--year');
  return {
    schedule: get('--schedule'),
    generator: get('--generator'),
    year: yearStr !== undefined ? parseInt(yearStr, 10) : undefined,
  };
}

/**
 * Returns the years to generate and the date window to keep.
 * Default (no --year): 6 months back through 1 year ahead (rolling window).
 * With --year N: exactly year N, no filtering.
 */
function getWindow(year?: number): { years: number[]; dateMin?: Date; dateMax?: Date } {
  if (year !== undefined) {
    return { years: [year] };
  }
  const today = new Date();
  const dateMin = new Date(today);
  dateMin.setUTCMonth(dateMin.getUTCMonth() - 6);
  dateMin.setUTCHours(0, 0, 0, 0);
  const dateMax = new Date(today);
  dateMax.setUTCFullYear(dateMax.getUTCFullYear() + 1);
  dateMax.setUTCHours(23, 59, 59, 999);
  const years = [...new Set([dateMin.getUTCFullYear(), today.getUTCFullYear(), dateMax.getUTCFullYear()])];
  return { years, dateMin, dateMax };
}

/** Fetch only what the wall calendars need, one request set at a time. */
async function generateWallCalendarEvents(): Promise<CalendarEvent[]> {
  const events: CalendarEvent[] = [];
  for (const gen of ALL_GENERATORS.filter((g) => WALL_CALENDAR_CATEGORIES.includes(g.slug))) {
    for (const year of wallCalendarYears(new Date())) events.push(...(await gen.generate(year)));
  }
  return events;
}

/** Full calendar years for the wall calendars, from the same events as the feed. */
function writeWallCalendarEvents(events: readonly CalendarEvent[]) {
  const years = wallCalendarYears(new Date());
  const selected = selectWallCalendarEvents(events, years);
  const outPath = join('data', 'wall-calendar-events.json');
  writeFileSync(outPath, JSON.stringify(selected, null, 2));
  console.log(`  ✓ ${selected.length} wall calendar events (${years.join(', ')}) → ${outPath}`);
}

async function main() {
  mkdirSync('data', { recursive: true });
  if (process.argv.includes('--wall-calendar')) return writeWallCalendarEvents(await generateWallCalendarEvents());
  const { schedule, generator, year } = parseArgs();

  let generators = ALL_GENERATORS;
  if (schedule) generators = generators.filter((g) => g.schedule === schedule);
  if (generator) generators = generators.filter((g) => g.slug === generator);

  if (generators.length === 0) {
    console.error('No generators matched the given filters.');
    process.exit(1);
  }

  const { years, dateMin, dateMax } = getWindow(year);
  const windowDesc = dateMin && dateMax
    ? `${dateMin.toISOString().slice(0, 10)} to ${dateMax.toISOString().slice(0, 10)}`
    : `year=${years[0]}`;

  const generated: CalendarEvent[] = [];

  for (const gen of generators) {
    console.log(`Running generator: ${gen.slug} (${windowDesc})`);
    try {
      const allEvents = (await Promise.all(years.map((y) => gen.generate(y)))).flat();
      generated.push(...allEvents);

      const seen = new Set<string>();
      const unique = allEvents.filter((e) => {
        if (seen.has(e.uid)) return false;
        seen.add(e.uid);
        return true;
      });

      const events = dateMin && dateMax
        ? unique.filter((e) => {
            const start = new Date(e.start);
            return start >= dateMin && start <= dateMax;
          })
        : unique;

      const outPath = join('data', `${gen.slug}.json`);
      writeFileSync(outPath, JSON.stringify(events, null, 2));
      console.log(`  ✓ ${events.length} events → ${outPath}`);
    } catch (err) {
      console.error(`  ✗ ${gen.slug} failed:`, err);
      process.exit(1);
    }
  }

  // Whole years of what the generators above just fetched, before the window cut them down.
  // Only a run of all the monthly generators has everything it needs.
  if (!generator && year === undefined && schedule !== 'weekly') writeWallCalendarEvents(generated);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
