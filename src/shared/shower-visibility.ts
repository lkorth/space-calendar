/** Which meteor showers can be seen from where. A shower's meteors come from its radiant, so
 *  where the radiant stays at or below the horizon there is nothing to watch. Shared by the
 *  feed and the wall calendars so the two agree. */

/** Declination of each radiant in degrees, from the AMS meteor shower calendar, keyed by the
 *  name in the event UID. */
export const RADIANT_DECLINATION: Readonly<Record<string, number>> = {
  quadrantids: 49,
  lyrids: 33,
  'eta-aquariids': -1,
  'delta-aquariids': -16,
  perseids: 58,
  orionids: 16,
  leonids: 22,
  geminids: 33,
  ursids: 76,
};

/** A lower radiant shows hardly any meteors, through the thickest air. */
const MIN_RADIANT_ALT = 10;

/** With only a hemisphere to go on, nothing is hidden that anyone in most of it could see. */
const NEAR_EQUATOR = 10;

/** The shower's name in an event UID, e.g. "eta-aquariids", or null for another event. */
export function showerOf(uid: string): string | null {
  return /^meteor-shower-(.+)-\d{4}@/.exec(uid)?.[1] ?? null;
}

/** Whether the radiant climbs high enough at a latitude. A shower not listed here is shown. */
export function showerVisibleFrom(shower: string, lat: number): boolean {
  const declination = RADIANT_DECLINATION[shower];
  return declination === undefined || 90 - Math.abs(lat - declination) >= MIN_RADIANT_ALT;
}

/** Whether to list a shower for a subscriber whose latitude may not be known. */
export function showerVisible(shower: string, where: { lat?: number; hemisphere?: 'northern' | 'southern' }): boolean {
  const lat = where.lat ?? (where.hemisphere === 'southern' ? -NEAR_EQUATOR : NEAR_EQUATOR);
  return showerVisibleFrom(shower, lat);
}
