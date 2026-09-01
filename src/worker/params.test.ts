import { describe, it, expect } from 'vitest';
import {
  isFixedOffsetTimezone,
  isValidTimezone,
  normalizeTimezone,
  parseCategories,
  parseParams,
  recoverEmbeddedParams,
} from './params.ts';

function paramsOf(query: string) {
  return parseParams(new URL(`https://space-calendar.workers.dev/feed.ics${query}`));
}

describe('normalizeTimezone', () => {
  it('passes through IANA zone names unchanged', () => {
    expect(normalizeTimezone('America/Chicago')).toBe('America/Chicago');
    expect(normalizeTimezone('Europe/Warsaw')).toBe('Europe/Warsaw');
    expect(normalizeTimezone('Australia/Sydney')).toBe('Australia/Sydney');
  });

  it('passes through Etc/GMT zones, which Intl already accepts', () => {
    expect(normalizeTimezone('Etc/GMT-2')).toBe('Etc/GMT-2');
    expect(normalizeTimezone('UTC')).toBe('UTC');
  });

  it('rewrites fixed-offset spellings to the equivalent Etc/GMT zone', () => {
    // POSIX sign inversion: UTC+2 is Etc/GMT-2.
    expect(normalizeTimezone('UTC+2')).toBe('Etc/GMT-2');
    expect(normalizeTimezone('GMT+02:00')).toBe('Etc/GMT-2');
    expect(normalizeTimezone('+02:00')).toBe('Etc/GMT-2');
    expect(normalizeTimezone('-5')).toBe('Etc/GMT+5');
    expect(normalizeTimezone('UTC-08:00')).toBe('Etc/GMT+8');
  });

  it('maps a zero offset to UTC', () => {
    expect(normalizeTimezone('+00:00')).toBe('UTC');
    expect(normalizeTimezone('GMT-0')).toBe('UTC');
  });

  it('leaves offsets Etc/GMT cannot express to the runtime', () => {
    // Half-hour zones have no Etc/GMT equivalent, so they are passed through where the
    // runtime accepts them as a timeZone and dropped where it does not.
    for (const raw of ['+05:30', '+20:00']) {
      const normalized = normalizeTimezone(raw);
      expect(normalized === undefined || isValidTimezone(normalized)).toBe(true);
    }
  });

  it('flags every offset spelling as fixed-offset once normalized', () => {
    for (const raw of ['UTC+2', '+02:00', 'Etc/GMT-2', '-5', '+00:00']) {
      expect(isFixedOffsetTimezone(normalizeTimezone(raw))).toBe(true);
    }
  });

  it('returns undefined for unparseable or empty input', () => {
    expect(normalizeTimezone(undefined)).toBeUndefined();
    expect(normalizeTimezone('')).toBeUndefined();
    expect(normalizeTimezone('   ')).toBeUndefined();
    expect(normalizeTimezone('Not/ATimezone')).toBeUndefined();
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeTimezone('  America/Denver  ')).toBe('America/Denver');
  });

  it('only ever returns zones Intl accepts', () => {
    for (const raw of ['America/Chicago', 'UTC+2', '-5', '+00:00', 'Etc/GMT-2']) {
      expect(isValidTimezone(normalizeTimezone(raw)!)).toBe(true);
    }
  });
});

describe('isFixedOffsetTimezone', () => {
  it('identifies fixed offsets, which carry no DST rules', () => {
    expect(isFixedOffsetTimezone('Etc/GMT-2')).toBe(true);
    expect(isFixedOffsetTimezone('UTC')).toBe(true);
    expect(isFixedOffsetTimezone('GMT')).toBe(true);
  });

  it('does not flag region zones', () => {
    expect(isFixedOffsetTimezone('Europe/Warsaw')).toBe(false);
    expect(isFixedOffsetTimezone('America/Chicago')).toBe(false);
    expect(isFixedOffsetTimezone(undefined)).toBe(false);
  });
});

describe('parseCategories', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseCategories('moon-phases, comets ,launches')).toEqual(['moon-phases', 'comets', 'launches']);
  });

  it('expands the legacy sky-events group', () => {
    expect(parseCategories('sky-events')).toEqual([
      'moon-phases',
      'meteor-showers',
      'solstices-equinoxes',
      'eclipses-solar',
      'eclipses-lunar',
    ]);
  });

  it('expands the legacy planetary group', () => {
    expect(parseCategories('planetary')).toEqual(['oppositions', 'elongations', 'asteroids', 'comets']);
  });

  it('deduplicates when a legacy group overlaps an explicit slug', () => {
    // The shape seen in production: a URL from the transitional configurator that
    // listed both the group and some of its members.
    expect(parseCategories('moon-phases,sky-events,planetary,meteor-showers,launches,history')).toEqual([
      'moon-phases',
      'meteor-showers',
      'solstices-equinoxes',
      'eclipses-solar',
      'eclipses-lunar',
      'oppositions',
      'elongations',
      'asteroids',
      'comets',
      'launches',
      'history',
    ]);
  });

  it('leaves unknown slugs in place for the worker to ignore', () => {
    expect(parseCategories('moon-phases,not-a-real-category')).toEqual(['moon-phases', 'not-a-real-category']);
  });

  it('returns an empty list for empty input', () => {
    expect(parseCategories('')).toEqual([]);
    expect(parseCategories(' , , ')).toEqual([]);
  });
});

describe('recoverEmbeddedParams', () => {
  it('splits parameters swallowed into an earlier value', () => {
    const recovered = recoverEmbeddedParams(
      new URLSearchParams({ c: 'moon-phases,aurora&lat=45&hemi=north&tz=America/Chicago' }),
    );
    expect(recovered.get('c')).toBe('moon-phases,aurora');
    expect(recovered.get('lat')).toBe('45');
    expect(recovered.get('hemi')).toBe('north');
    expect(recovered.get('tz')).toBe('America/Chicago');
  });

  it('never overrides a parameter that was actually supplied', () => {
    const recovered = recoverEmbeddedParams(
      new URLSearchParams([['c', 'moon-phases&tz=America/Chicago'], ['tz', 'Europe/London']]),
    );
    expect(recovered.get('tz')).toBe('Europe/London');
  });

  it('leaves a value alone when the tail is not all key=value pairs', () => {
    const recovered = recoverEmbeddedParams(new URLSearchParams({ club: 'rocket & telescope society' }));
    expect(recovered.get('club')).toBe('rocket & telescope society');
  });

  it('passes ordinary queries through untouched', () => {
    const recovered = recoverEmbeddedParams(new URLSearchParams({ c: 'moon-phases', tz: 'Europe/Oslo' }));
    expect(recovered.get('c')).toBe('moon-phases');
    expect(recovered.get('tz')).toBe('Europe/Oslo');
  });
});

describe('parseParams', () => {
  it('parses a well-formed subscription URL', () => {
    expect(paramsOf('?c=moon-phases,aurora&lat=45&hemi=north&tz=America/Chicago&club=jgap')).toEqual({
      categories: ['moon-phases', 'aurora'],
      lat: 45,
      hemisphere: 'northern',
      tz: 'America/Chicago',
      club: 'jgap',
    });
  });

  it('recovers a double-encoded URL end to end', () => {
    // The exact shape logged from a chatgpt.com referral.
    const params = paramsOf(
      '?c=moon-phases%2Caurora%26lat%3D45%26hemi%3Dnorth%26tz%3DAmerica%2FChicago&utm_source=chatgpt.com',
    );
    expect(params.categories).toEqual(['moon-phases', 'aurora']);
    expect(params.lat).toBe(45);
    expect(params.tz).toBe('America/Chicago');
    expect(params.hemisphere).toBe('northern');
  });

  it('accepts several spellings of the southern hemisphere', () => {
    expect(paramsOf('?c=moon-phases&hemi=south').hemisphere).toBe('southern');
    expect(paramsOf('?c=moon-phases&hemi=Southern').hemisphere).toBe('southern');
    expect(paramsOf('?c=moon-phases&hemi=S').hemisphere).toBe('southern');
  });

  it('defaults to the northern hemisphere', () => {
    expect(paramsOf('?c=moon-phases').hemisphere).toBe('northern');
    expect(paramsOf('?c=moon-phases&hemi=north').hemisphere).toBe('northern');
  });

  it('treats a non-numeric latitude as absent rather than NaN', () => {
    expect(paramsOf('?c=moon-phases&lat=abc').lat).toBeUndefined();
    expect(paramsOf('?c=moon-phases&lat=').lat).toBeUndefined();
  });

  it('rounds latitude to a whole degree', () => {
    expect(paramsOf('?c=moon-phases&lat=44.6').lat).toBe(45);
    expect(paramsOf('?c=moon-phases&lat=-33.4&hemi=south').lat).toBe(-33);
  });

  it('concatenates repeated c parameters', () => {
    expect(paramsOf('?c=moon-phases&c=comets').categories).toEqual(['moon-phases', 'comets']);
  });

  it('drops an unusable timezone instead of passing it downstream', () => {
    expect(paramsOf('?c=moon-phases&tz=Not/ATimezone').tz).toBeUndefined();
  });

  it('normalizes a fixed-offset timezone', () => {
    expect(paramsOf('?c=moon-phases&tz=UTC%2B2').tz).toBe('Etc/GMT-2');
    expect(paramsOf('?c=moon-phases&tz=Etc%2FGMT-2').tz).toBe('Etc/GMT-2');
  });

  it('treats a blank club as absent', () => {
    expect(paramsOf('?c=astronomy-clubs&club=').club).toBeUndefined();
  });
});
