/**
 * Meta tests ensuring every CategorySlug is represented in both the
 * configurator HTML and the e2e test suite.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { STATIC_CATEGORIES, LIVE_CATEGORIES } from '../shared/models.ts';

// Both aurora slugs are represented by a single checkbox; getAuroraSlug() maps
// it to 'aurora' or 'aurora-australis' based on hemisphere.
const AURORA_EXCEPTIONS = new Set(['aurora', 'aurora-australis']);

const CONFIGURATOR_EXCEPTIONS = new Set([...AURORA_EXCEPTIONS]);

describe('configurator', () => {
  it('has an entry for every category slug', () => {
    const html = readFileSync('src/site/index.html', 'utf-8');
    const allSlugs = [...STATIC_CATEGORIES, ...LIVE_CATEGORIES];

    for (const slug of allSlugs) {
      if (CONFIGURATOR_EXCEPTIONS.has(slug)) continue;
      expect(html, `Missing value="${slug}" in index.html`).toContain(`value="${slug}"`);
    }
  });
});

describe('configurator hosting', () => {
  const wrangler = readFileSync('wrangler.toml', 'utf-8');

  it('serves the site as static assets from the worker domain', () => {
    // Same origin as the feed, so there is no redirect to keep in sync.
    expect(wrangler).toMatch(/\[assets\]/);
    expect(wrangler).toMatch(/directory\s*=\s*"\.\/src\/site"/);
  });

  it('does not run the worker ahead of static assets', () => {
    // run_worker_first would make every page load a billable Worker invocation.
    // Static asset requests are free and unlimited only while the Worker is not run first.
    expect(wrangler).not.toContain('run_worker_first');
  });

  it('keeps the test file out of the published bundle', () => {
    const ignore = readFileSync('src/site/.assetsignore', 'utf-8');
    expect(ignore).toContain('site.test.ts');
  });

  it('has no lingering reference to the old GitHub Pages host', () => {
    const worker = readFileSync('src/worker/index.ts', 'utf-8');
    expect(worker).not.toContain('lkorth.github.io');
    expect(worker).not.toContain('pages.dev');
  });
});

describe('configurator subscribe flow', () => {
  const html = readFileSync('src/site/index.html', 'utf-8');

  it('offers a webcal:// subscribe path for Apple Calendar', () => {
    // 54% of subscribers arrive via Apple Calendar, and webcal:// is the only one-tap
    // route into it. Losing this would silently regress the largest client segment.
    expect(html).toContain("'webcal:'");
    expect(html).toContain('function addToApple()');
  });

  it('offers both calendars unconditionally, ordered by platform', () => {
    // Both buttons are always present; only their order and emphasis vary, so nobody
    // is stuck when the user-agent guess does not match the calendar they actually use.
    expect(html).toContain('function addToGoogle()');
    expect(html).toContain('calendar.google.com/calendar/r?cid=');
    expect(html).toContain('function orderSubscribeButtons()');
  });

  it('falls back to a selectable URL when the clipboard is unavailable', () => {
    // In-app browsers (Instagram, Facebook) can withhold or reject the clipboard API.
    expect(html).toContain('function showUrlFallback(');
    expect(html).toMatch(/if \(!navigator\.clipboard\) return showUrlFallback/);
    expect(html).toContain('.catch(() => showUrlFallback(url))');
  });
});

describe('configurator campaign attribution', () => {
  const html = readFileSync('src/site/index.html', 'utf-8');

  // Run the real campaignSource() from the page against a stubbed location, so these
  // assert behavior rather than the presence of a string.
  function campaignSource(search: string): string | null {
    const src = /function campaignSource\(\)[\s\S]*?\n    \}/.exec(html)?.[0];
    expect(src, 'campaignSource() not found in index.html').toBeDefined();
    return new Function('location', `${src}; return campaignSource();`)({ search }) as string | null;
  }

  it('picks up utm_source from the landing URL', () => {
    expect(campaignSource('?utm_source=instagram')).toBe('instagram');
    expect(campaignSource('?utm_source=instagram-orionids')).toBe('instagram-orionids');
  });

  it('returns null when there is no campaign', () => {
    expect(campaignSource('')).toBeNull();
    expect(campaignSource('?utm_medium=cpc')).toBeNull();
    expect(campaignSource('?utm_source=')).toBeNull();
  });

  it('strips characters that should never reach a persisted feed URL', () => {
    // The value ends up in the subscriber's calendar client indefinitely.
    expect(campaignSource('?utm_source=insta%20gram')).toBe('instagram');
    expect(campaignSource('?utm_source=%3Cscript%3E')).toBe('script');
    expect(campaignSource('?utm_source=%26c%3Devil')).toBe('cevil');
    expect(campaignSource('?utm_source=%2E%2E%2F%2E%2E')).toBe('....');
  });

  it('caps the length so a crafted link cannot bloat every feed request', () => {
    expect(campaignSource(`?utm_source=${'a'.repeat(500)}`)).toHaveLength(32);
  });

  it('drops a value that sanitizes to nothing', () => {
    expect(campaignSource('?utm_source=%21%40%23%24')).toBeNull();
  });

  it('appends utm_source to the generated subscription URL', () => {
    expect(html).toContain("url.searchParams.set('utm_source', CAMPAIGN_SOURCE)");
  });
});

describe('configurator preview limits', () => {
  const html = readFileSync('src/site/index.html', 'utf-8');

  // Execute the page's own selection logic rather than assert on its source text.
  function select(starts: string[], now: string, allDay = false): string[] {
    const parts = [
      /const PREVIEW_MAX_EVENTS = \d+;/,
      /const PREVIEW_MAX_MONTHS = \d+;/,
      /function previewMonthKey\([\s\S]*?\n    \}/,
      /function selectPreviewEvents\([\s\S]*?\n    \}/,
    ].map((re) => {
      const m = re.exec(html);
      expect(m, `could not extract ${re}`).not.toBeNull();
      return m![0];
    });
    const events = starts.map((start) => ({ start, allDay }));
    const fn = new Function(
      'events',
      'now',
      'detectedTZ',
      `${parts.join('\n')}; return selectPreviewEvents(events, now).map(e => e.start);`,
    );
    return fn(events, new Date(now), 'UTC') as string[];
  }

  function monthsIn(starts: string[]): number {
    return new Set(starts.map((s) => s.slice(0, 7))).size;
  }

  it('stops after four month sections', () => {
    // One event a month for a year: the section limit bites first.
    const starts = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 8 + i, 15)).toISOString());
    const picked = select(starts, '2026-09-01T00:00:00Z');
    expect(monthsIn(picked)).toBe(4);
    expect(picked).toHaveLength(4);
  });

  it('stops at twenty events when they are densely packed', () => {
    // 60 consecutive days spans only three months, so the count limit bites first.
    const starts = Array.from({ length: 60 }, (_, i) => {
      const d = new Date('2026-09-01T00:00:00Z');
      d.setUTCDate(d.getUTCDate() + i + 1);
      return d.toISOString();
    });
    const picked = select(starts, '2026-09-01T00:00:00Z');
    expect(picked).toHaveLength(20);
    expect(monthsIn(picked)).toBeLessThanOrEqual(4);
  });

  it('counts months that contain events, not calendar months from today', () => {
    // The eclipses-only case: nothing for five months, then sparse events. A rolling
    // four-month window would show nothing at all; four sections still previews them.
    const starts = [
      '2027-02-06T00:00:00Z', '2027-08-02T00:00:00Z',
      '2028-01-12T00:00:00Z', '2028-07-06T00:00:00Z', '2028-12-31T00:00:00Z',
    ];
    const picked = select(starts, '2026-09-01T00:00:00Z');
    expect(picked).toHaveLength(4);
    expect(picked[0]).toBe('2027-02-06T00:00:00Z');
    expect(picked.at(-1)).toBe('2028-07-06T00:00:00Z');
  });

  it('keeps every event within an included section', () => {
    // A busy fourth month must not be truncated mid-section by the month limit.
    const starts = [
      '2026-09-05T00:00:00Z', '2026-10-05T00:00:00Z', '2026-11-05T00:00:00Z',
      '2026-12-05T00:00:00Z', '2026-12-06T00:00:00Z', '2026-12-07T00:00:00Z',
      '2027-01-05T00:00:00Z',
    ];
    const picked = select(starts, '2026-09-01T00:00:00Z');
    expect(picked).toHaveLength(6);
    expect(picked).not.toContain('2027-01-05T00:00:00Z');
  });

  it('excludes events in the past', () => {
    const picked = select(['2026-08-31T23:00:00Z', '2026-09-02T00:00:00Z'], '2026-09-01T00:00:00Z');
    expect(picked).toEqual(['2026-09-02T00:00:00Z']);
  });

  it('returns nothing when the selection has no upcoming events', () => {
    expect(select([], '2026-09-01T00:00:00Z')).toEqual([]);
    expect(select(['2020-01-01T00:00:00Z'], '2026-09-01T00:00:00Z')).toEqual([]);
  });

  it('shares one month key between selection and rendering', () => {
    // Two definitions could disagree and draw a fifth heading.
    expect(html).toContain('const monthKey = previewMonthKey(ev);');
    expect(html.match(/function previewMonthKey\(/g)).toHaveLength(1);
  });
});

describe('configurator DOM wiring', () => {
  const html = readFileSync('src/site/index.html', 'utf-8');

  it('references only element ids that exist in the markup', () => {
    const declared = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!));
    const referenced = [...html.matchAll(/getElementById\('([^']+)'\)/g)].map((m) => m[1]!);

    expect(referenced.length).toBeGreaterThan(0);
    for (const id of new Set(referenced)) {
      expect(declared, `getElementById('${id}') has no matching element`).toContain(id);
    }
  });

  it('binds every inline handler to a defined function', () => {
    const handlers = [...html.matchAll(/on(?:click|change|input)="([a-zA-Z_$][\w$]*)\(/g)]
      .map((m) => m[1]!);

    expect(handlers.length).toBeGreaterThan(0);
    for (const fn of new Set(handlers)) {
      if (fn === 'this') continue;
      expect(html, `handler ${fn}() is referenced but not defined`).toMatch(
        new RegExp(`function\\s+${fn}\\s*\\(`),
      );
    }
  });
});

describe('configurator sponsor link', () => {
  const html = readFileSync('src/site/index.html', 'utf-8');

  it('points at the GitHub Sponsors profile', () => {
    expect(html).toContain('https://github.com/sponsors/lkorth');
  });

  it('opens in a new tab without leaking the opener', () => {
    const anchor = /<a class="btn-sponsor"[^>]*>/.exec(html)?.[0] ?? '';
    expect(anchor).toContain('target="_blank"');
    expect(anchor).toContain('rel="noopener"');
  });
});

describe('e2e test coverage', () => {
  it('has a test for every category slug', () => {
    const e2e = readFileSync('src/worker/feed.e2e.test.ts', 'utf-8');
    const allSlugs = [...STATIC_CATEGORIES, ...LIVE_CATEGORIES];

    // aurora-australis is covered by the aurora test (hemisphere determines the slug)
    const E2E_EXCEPTIONS = new Set(['aurora-australis']);

    for (const slug of allSlugs) {
      if (E2E_EXCEPTIONS.has(slug)) continue;
      expect(e2e, `Missing e2e test for slug "${slug}" in feed.e2e.test.ts`).toContain(`c=${slug}`);
    }
  });
});
