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
