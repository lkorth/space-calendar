/**
 * Pipeline orchestrator. Run via:
 *   npm run pipeline                  — all generators
 *   npm run pipeline:annual           — annual schedule only
 *   npm run pipeline:monthly          — monthly schedule only
 *   npm run pipeline:weekly           — weekly schedule only
 *   tsx src/pipeline/run.ts --generator moon-phases
 *   tsx src/pipeline/run.ts --year 2027
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Generator } from '../shared/models.ts';

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
];

function parseArgs(): { schedule?: string; generator?: string; year: number } {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i !== -1 ? args[i + 1] : undefined;
  };
  return {
    schedule: get('--schedule'),
    generator: get('--generator'),
    year: parseInt(get('--year') ?? String(new Date().getFullYear()), 10),
  };
}

async function main() {
  const { schedule, generator, year } = parseArgs();

  let generators = ALL_GENERATORS;
  if (schedule) generators = generators.filter((g) => g.schedule === schedule);
  if (generator) generators = generators.filter((g) => g.slug === generator);

  if (generators.length === 0) {
    console.error('No generators matched the given filters.');
    process.exit(1);
  }

  mkdirSync('data', { recursive: true });

  for (const gen of generators) {
    console.log(`Running generator: ${gen.slug} (year=${year})`);
    try {
      const events = await gen.generate(year);
      const outPath = join('data', `${gen.slug}.json`);
      writeFileSync(outPath, JSON.stringify(events, null, 2));
      console.log(`  ✓ ${events.length} events → ${outPath}`);
    } catch (err) {
      console.error(`  ✗ ${gen.slug} failed:`, err);
      process.exit(1);
    }
  }
}

main();
