/** Local dates and clock times for one zone. A local date is written as the UTC midnight of
 *  the same calendar date ("day" below), so dates can be compared and counted directly. */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;

export function monthName(month: number): string {
  return MONTHS[month]!;
}

/** "JAN 4" */
export function formatDay(day: number): string {
  const date = new Date(day);
  return `${monthName(date.getUTCMonth())} ${date.getUTCDate()}`;
}

export class LocalClock {
  private readonly format: Intl.DateTimeFormat;
  private readonly offsets = new Map<number, number>();

  constructor(readonly tz: string) {
    this.format = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
  }

  /** UTC offset in ms. Asking Intl is slow, so a UTC day that starts and ends on the same
   *  offset is taken to keep it; only the days a zone changes are looked up in full. */
  offset(ms: number): number {
    const day = Math.floor(ms / DAY_MS) * DAY_MS;
    const start = this.lookUp(day);
    if (start === this.lookUp(day + DAY_MS)) return start;
    // Zones change on quarter hours at the finest.
    return this.lookUp(Math.floor(ms / (HOUR_MS / 4)) * (HOUR_MS / 4));
  }

  private lookUp(ms: number): number {
    let found = this.offsets.get(ms);
    if (found === undefined) {
      const parts = Object.fromEntries(this.format.formatToParts(ms).map((p) => [p.type, Number(p.value)]));
      found = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!) - ms;
      this.offsets.set(ms, found);
    }
    return found;
  }

  /** The local date on which a moment falls. */
  dayOf(ms: number): number {
    return Math.floor((ms + this.offset(ms)) / DAY_MS) * DAY_MS;
  }

  /** The moment the clock shows `hours` on a local date. Hours may pass 24. */
  at(day: number, hours: number): number {
    const wall = day + hours * HOUR_MS;
    const guess = wall - this.offset(wall);
    return wall - this.offset(guess);
  }

  /** What the clock shows at a moment, as hours after midnight of a local date. */
  hoursAfter(day: number, ms: number): number {
    return (ms + this.offset(ms) - day) / HOUR_MS;
  }

  /** "7:52 AM" */
  time(ms: number): string {
    const minutes = Math.round((ms + this.offset(ms)) / 60_000);
    const inDay = ((minutes % 1440) + 1440) % 1440;
    const hour = Math.floor(inDay / 60);
    return `${hour % 12 || 12}:${String(inDay % 60).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
  }

  /** "3 AM", to the nearest hour */
  nearestHour(ms: number): string {
    return this.time(Math.round((ms + this.offset(ms)) / HOUR_MS) * HOUR_MS - this.offset(ms)).replace(':00', '');
  }
}
