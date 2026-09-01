import type { CategorySlug } from '../shared/models.ts';
import type { Hemisphere, RequestParams } from './types.ts';

/** Category slugs that older subscription URLs still request, mapped to the slugs that
 *  replaced them. An early version of the configurator offered coarse groups instead of
 *  one slug per event type; subscriptions created then are still in calendar clients and
 *  cannot be edited by us, so the worker expands the old group into its members rather
 *  than silently dropping it. The groupings mirror the "Celestial — Sky Events" and
 *  "Celestial — Planetary" tables in CATEGORIES.md. */
export const LEGACY_CATEGORY_ALIASES: Record<string, CategorySlug[]> = {
  'sky-events': ['moon-phases', 'meteor-showers', 'solstices-equinoxes', 'eclipses-solar', 'eclipses-lunar'],
  planetary: ['oppositions', 'elongations', 'asteroids', 'comets'],
};

/** A tail fragment of a swallowed query string, e.g. "tz=America/Chicago". */
const PARAM_FRAGMENT = /^([A-Za-z][A-Za-z0-9_-]*)=(.*)$/;

/** Fixed UTC offset spellings that Intl rejects: "UTC+2", "GMT+02:00", "+02:00", "-5". */
const FIXED_OFFSET = /^(?:UTC|GMT)?([+-])(\d{1,2})(?::?(\d{2}))?$/i;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** True when tz names a fixed UTC offset rather than a region with DST rules.
 *
 *  These arrive when a client sends a computed offset instead of an IANA zone name, and
 *  they are lossy in a way we cannot undo: the offset is usually captured while DST is
 *  active, so "Etc/GMT-2" is equally consistent with Europe/Kyiv year-round and with
 *  Europe/Warsaw in July. Mapping one to a representative DST zone would be a guess that
 *  is wrong for half the year in one direction or the other, so we serve the offset as
 *  given and log it instead. */
export function isFixedOffsetTimezone(tz: string | undefined): boolean {
  if (!tz) return false;
  return tz === 'UTC' || tz === 'GMT' || tz.startsWith('Etc/') || FIXED_OFFSET.test(tz);
}

/** Resolve a tz parameter to a zone Intl accepts, or undefined if it cannot be salvaged.
 *
 *  Offset spellings are canonicalized to the equivalent IANA Etc/GMT zone before the
 *  passthrough, so that "UTC+2", "+02:00" and "Etc/GMT-2" all reduce to one value that
 *  isFixedOffsetTimezone recognizes — some runtimes accept a bare "+02:00" as a timeZone
 *  and would otherwise let it through unnormalized. Note the POSIX sign inversion, where
 *  UTC+2 is Etc/GMT-2. Offsets Etc/GMT cannot express (half-hour zones like +05:30, or
 *  anything beyond ±14) fall through to the passthrough, which keeps them where the
 *  runtime supports them and drops them where it does not. */
export function normalizeTimezone(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;

  const match = FIXED_OFFSET.exec(trimmed);
  if (match) {
    const [, sign, hoursStr, minutesStr] = match;
    const hours = Number(hoursStr);
    const wholeHour = minutesStr === undefined || minutesStr === '00';
    if (wholeHour && hours === 0) return 'UTC';
    if (wholeHour && hours <= 14) {
      const inverted = sign === '+' ? -hours : hours;
      const candidate = `Etc/GMT${inverted > 0 ? '+' : ''}${inverted}`;
      if (isValidTimezone(candidate)) return candidate;
    }
  }

  return isValidTimezone(trimmed) ? trimmed : undefined;
}

/** Recover parameters that a double-encoded URL swallowed into another value.
 *
 *  Link rewriters (ChatGPT's `utm_source=chatgpt.com` links are the case seen in the
 *  logs) sometimes percent-encode the whole query tail, so
 *  `?c=moon-phases&tz=America/Chicago` arrives as `?c=moon-phases%26tz%3DAmerica%2FChicago`
 *  and every parameter after the first is lost inside `c`. Split the value back apart and
 *  merge the recovered pairs in. A genuinely supplied parameter always wins, and a value
 *  is only split when every fragment after the first looks like `key=value`, so a real
 *  value containing "&" is left alone. */
export function recoverEmbeddedParams(searchParams: URLSearchParams): URLSearchParams {
  const out = new URLSearchParams(searchParams);
  for (const [key, value] of searchParams) {
    if (!value.includes('&')) continue;

    const [head, ...tail] = value.split('&');
    const fragments = tail.map((f) => PARAM_FRAGMENT.exec(f));
    if (fragments.some((f) => f === null)) continue;

    out.set(key, head!);
    for (const fragment of fragments) {
      const [, name, embedded] = fragment!;
      if (!out.has(name!)) out.set(name!, embedded!);
    }
  }
  return out;
}

/** Expand legacy group slugs and drop duplicates, preserving first-seen order. */
export function parseCategories(raw: string): CategorySlug[] {
  const slugs = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .flatMap((slug) => LEGACY_CATEGORY_ALIASES[slug] ?? [slug as CategorySlug]);
  return [...new Set(slugs)];
}

function parseHemisphere(raw: string | null): Hemisphere {
  const value = raw?.trim().toLowerCase();
  return value === 's' || value === 'south' || value === 'southern' ? 'southern' : 'northern';
}

function parseLat(raw: string | null): number | undefined {
  if (raw === null) return undefined;
  const parsed = parseFloat(raw);
  // A non-numeric lat is treated as absent rather than NaN, which would otherwise fail
  // the hemisphere cross-check in the worker and 400 an otherwise valid subscription.
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

export function parseParams(url: URL): RequestParams {
  const searchParams = recoverEmbeddedParams(url.searchParams);

  return {
    // Repeated ?c= parameters are concatenated rather than dropped.
    categories: parseCategories(searchParams.getAll('c').join(',')),
    lat: parseLat(searchParams.get('lat')),
    tz: normalizeTimezone(searchParams.get('tz') ?? undefined),
    hemisphere: parseHemisphere(searchParams.get('hemi')),
    club: searchParams.get('club')?.trim() || undefined,
  };
}
