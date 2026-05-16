import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLunarEclipses, eclipseVisibility } from './nasa.ts';

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

  it('parses greatest eclipse time as HH:MM', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    expect(eclipses[0]?.greatest).toBe('11:34');
    expect(eclipses[1]?.greatest).toBe('04:14');
  });

  it('computes P1 as greatest minus half the penumbral duration', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    const eclipse = eclipses[0]!;
    // Greatest: 11:34:52, penDur: 338.6 min → half = 169.3 min
    const greatestMs = new Date('2026-03-03T11:34:00Z').getTime();
    const p1Ms = new Date(eclipse.p1).getTime();
    const diffMinutes = (greatestMs - p1Ms) / 60000;
    expect(diffMinutes).toBeCloseTo(169.3, 0);
  });

  it('computes P4 as greatest plus half the penumbral duration', async () => {
    const eclipses = await fetchLunarEclipses(2026);
    const eclipse = eclipses[0]!;
    const greatestMs = new Date('2026-03-03T11:34:00Z').getTime();
    const p4Ms = new Date(eclipse.p4).getTime();
    const diffMinutes = (p4Ms - greatestMs) / 60000;
    expect(diffMinutes).toBeCloseTo(169.3, 0);
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
