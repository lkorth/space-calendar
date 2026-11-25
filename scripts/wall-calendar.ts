/**
 * Draws one wall calendar to stdout, from the calendar data in data/wall-calendar-events.json.
 *
 *   npm run -s wall-calendar -- --type year-wheel-night --year 2027 --lat 51.5 --lon 0 \
 *     --tz Europe/London --place Greenwich --mode laser --qr true > calendar.svg
 *
 * --events <file> reads the events from somewhere else.
 */
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { drawWallCalendar, parseOptions } from '../src/shared/wall-calendar/options.ts';

const names = ['type', 'year', 'lat', 'lon', 'tz', 'place', 'mode', 'qr', 'text', 'shape', 'events'] as const;
const { values } = parseArgs({
  // A negative coordinate would read as another option unless it is joined to its name.
  args: process.argv.slice(2).reduce<string[]>((args, arg) => {
    if (/^-\d/.test(arg)) args.push(`${args.pop()}=${arg}`);
    else args.push(arg);
    return args;
  }, []),
  options: Object.fromEntries(names.map((name) => [name, { type: 'string' as const }])),
});

const { events = 'data/wall-calendar-events.json', ...query } = values as Record<string, string>;

const options = parseOptions(new URLSearchParams(query), new Date());
if ('error' in options) {
  console.error(options.error);
  process.exit(1);
}
process.stdout.write(drawWallCalendar(options, JSON.parse(readFileSync(events, 'utf-8'))));
