/**
 * Ensures every CategorySlug has a corresponding entry in the configurator HTML.
 * If this fails, add a checkbox with value="<slug>" to src/site/index.html.
 *
 * Exception: aurora-australis is derived from the aurora checkbox + hemisphere
 * selection and intentionally has no direct value= entry.
 */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { STATIC_CATEGORIES, LIVE_CATEGORIES } from '../shared/models.ts';

const CONFIGURATOR_EXCEPTIONS = new Set([
  // Both aurora slugs are represented by a single checkbox; getAuroraSlug() in the
  // configurator JS maps it to 'aurora' or 'aurora-australis' based on hemisphere.
  'aurora',
  'aurora-australis',
]);

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
