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
