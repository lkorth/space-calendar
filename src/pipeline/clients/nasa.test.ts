import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLunarEclipses, fetchSolarEclipses, eclipseVisibility } from './nasa.ts';

const CATALOG_HEADER = `Title: Five Millennium Catalog of Lunar Eclipses
 Cat      Calendar   Greatest
 Num        Date      Eclipse    DT     Num  Num  Type QSE  Gamma    Mag.    Mag.    Pen.   Par.  Total   Lat.  Lng.
                                 s                                                     m      m      m
`;

const SAMPLE_LINES = `09708   2026 Mar 03  11:34:52     75    323  133   T   a-  -0.3765  2.1838  1.1507  338.6  207.2   58.3    6N  171W
09709   2026 Aug 28  04:14:04     75    329  138   P   t-   0.4964  1.9645  0.9299  337.8  198.1    -      9S   63W
09999   2027 Jan 15  06:00:00     76    400  140   N   a-   1.1000  0.8500 -0.1000  261.0    -      -     10N   45E
11129   2620 Oct 03  20:33:57   2026   7677  166   N   t-   1.0976  0.8736 -0.1853  261.5    -      -      5N   57E
`;

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve(CATALOG_HEADER + SAMPLE_LINES),
  }));
});

describe('fetchLunarEclipses', () => {
  it('returns only eclipses for the requested year', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses).toHaveLength(2);
  });

  it('does not match lines where 2026 appears as a delta-T value', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    // The false-match line (catalog 11129, year 2620) should not appear
    expect(eclipses.every((e) => e.year === 2026)).toBe(true);
  });

  it('parses Total eclipse type', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses[0]?.type).toBe('Total');
  });

  it('parses Partial eclipse type', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses[1]?.type).toBe('Partial');
  });

  it('parses Penumbral eclipse type for 2027', async () => {
    const eclipses = await fetchLunarEclipses(2027);
    expect(eclipses[0]?.type).toBe('Penumbral');
  });

  it('parses date fields correctly', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses[0]).toMatchObject({ year: 2026, month: 3, day: 3 });
    expect(eclipses[1]).toMatchObject({ year: 2026, month: 8, day: 28 });
  });

  it('converts greatest eclipse from Terrestrial Time to UT, to the nearest minute', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses[0]?.greatest).toBe('2026-03-03T11:34:00Z'); // 11:34:52 less 75 s is 11:33:37
    expect(eclipses[1]?.greatest).toBe('2026-08-28T04:13:00Z'); // 04:14:04 less 75 s is 04:12:49
  });

  it('counts every contact from the exact moment, then rounds once', async () => {
    const [total] = await fetchLunarEclipses(2026);
    // 11:33:37, give or take half of 338.6, 207.2 and 58.3 minutes
    expect(total).toMatchObject({
      p1: '2026-03-03T08:44:00Z',
      u1: '2026-03-03T09:50:00Z',
      u2: '2026-03-03T11:04:00Z',
      u3: '2026-03-03T12:03:00Z',
      u4: '2026-03-03T13:17:00Z',
      p4: '2026-03-03T14:23:00Z',
    });
  });

  it('keeps the catalog date, which the event UID is made from, when UT falls on the day before', async () => {
    const midnight = '09720   2030 Jun 15  00:00:40     78    400  140   P   a-   1.1000  0.8500  0.5000  261.0  100.0    -      10N   45E\n';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(midnight) }));
    const [eclipse] = await fetchLunarEclipses(2030);
    expect(eclipse).toMatchObject({ year: 2030, month: 6, day: 15, greatest: '2030-06-14T23:59:00Z' });
  });

  it('returns empty array when no eclipses match the year', async () => {
    const eclipses = await fetchLunarEclipses(2025);
    expect(eclipses).toHaveLength(0);
  });

  it('throws when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchLunarEclipses(2026)).rejects.toThrow('503');
  });
});

describe('eclipseVisibility', () => {
  it('returns Americas for western Pacific longitude', () => {
    const result = eclipseVisibility(-171); // 171W
    expect(result).toContain('Americas');
  });

  it('returns Europe & Africa for near-zero longitude', () => {
    const result = eclipseVisibility(10);
    expect(result).toContain('Europe & Africa');
  });

  it('returns Asia for eastern longitudes', () => {
    const result = eclipseVisibility(90);
    expect(result).toContain('Asia');
  });
});

describe('fetchSolarEclipses', () => {
  const catalog = `Title: Five Millennium Catalog of Solar Eclipses
    1  001  -1999 Jun 12  03:14:51  46438 -49456    5   T   -n  -0.2701  1.0733   6.0N  33.3W  74  344  247  06m37s
 9566  479   2026 Aug 12  17:47:06     75    329  126   T   -p   0.8977  1.0386  65.2N  25.2W  26  248  294  02m18s
 9567  479   2027 Feb 06  16:00:48     76    335  131   A   -n  -0.2952  0.9281  31.3S  48.5W  73  334  282  07m51s
 9568  479   2027 Aug 02  10:07:50     76    341  136   T   nn   0.1421  1.0790  25.5N  33.2E  82  202  258  06m23s
 9571  479   2029 Jan 14  17:13:48     77    359  151   P   t-   1.0553  0.8714  63.7N 114.2W   0  145
 9575  479   2030 Mar 02  00:00:40     78    400  150   H   t-   0.1000  1.0014  63.7N 114.2W   0  145
`;

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(catalog) }));
  });

  it('returns the date and type of each eclipse in the year', async () => {
    expect(await fetchSolarEclipses(2027)).toEqual([
      { year: 2027, month: 2, day: 6, type: 'Annular' },
      { year: 2027, month: 8, day: 2, type: 'Total' },
    ]);
    expect(await fetchSolarEclipses(2028)).toEqual([]);
  });

  it('reads rows without a path width', async () => {
    expect(await fetchSolarEclipses(2029)).toEqual([{ year: 2029, month: 1, day: 14, type: 'Partial' }]);
  });

  it('converts Terrestrial Time to UT, which can change the date', async () => {
    expect(await fetchSolarEclipses(2030)).toEqual([{ year: 2030, month: 3, day: 1, type: 'Hybrid' }]);
  });

  it('reports a failed request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(fetchSolarEclipses(2027)).rejects.toThrow('503');
  });
});
