import { describe, it, expect } from 'vitest';
import { ANNUAL_SHOWERS } from '../pipeline/clients/ams.ts';
import { RADIANT_DECLINATION, showerOf, showerVisible, showerVisibleFrom } from './shower-visibility.ts';

const seen = (lat: number) => Object.keys(RADIANT_DECLINATION).filter((s) => showerVisibleFrom(s, lat));

describe('RADIANT_DECLINATION', () => {
  it('lists every shower the pipeline generates', () => {
    const slugs = ANNUAL_SHOWERS.map((s) => s.name.toLowerCase().replace(/\s+/g, '-'));
    expect(Object.keys(RADIANT_DECLINATION).sort()).toEqual(slugs.sort());
  });
});

describe('showerVisibleFrom', () => {
  it('shows every shower at middle northern latitudes', () => {
    for (const lat of [25, 40, 52]) expect(seen(lat), String(lat)).toHaveLength(9);
  });

  it('leaves out far northern radiants in the south', () => {
    expect(seen(-34)).toEqual(['lyrids', 'eta-aquariids', 'delta-aquariids', 'orionids', 'leonids', 'geminids']);
    expect(seen(-10)).not.toContain('ursids');
    expect(seen(-10)).toContain('perseids');
  });

  it('leaves out southern radiants in the far north', () => {
    expect(seen(70)).not.toContain('delta-aquariids');
    expect(seen(70)).toContain('ursids');
  });

  it('shows a shower it does not know', () => {
    expect(showerVisibleFrom('new-shower', -60)).toBe(true);
  });
});

describe('showerVisible', () => {
  it('uses the latitude when there is one', () => {
    expect(showerVisible('perseids', { lat: -34, hemisphere: 'southern' })).toBe(false);
    expect(showerVisible('perseids', { lat: -10, hemisphere: 'southern' })).toBe(true);
    expect(showerVisible('ursids', { lat: 0, hemisphere: 'southern' })).toBe(true);
  });

  it('hides only what nearly nobody in the hemisphere can see when it does not know the latitude', () => {
    expect(showerVisible('ursids', { hemisphere: 'southern' })).toBe(false);
    expect(showerVisible('perseids', { hemisphere: 'southern' })).toBe(true);
    for (const shower of Object.keys(RADIANT_DECLINATION)) {
      expect(showerVisible(shower, { hemisphere: 'northern' }), shower).toBe(true);
      expect(showerVisible(shower, {}), shower).toBe(true);
    }
  });
});

describe('showerOf', () => {
  it('reads the shower from an event UID', () => {
    expect(showerOf('meteor-shower-eta-aquariids-2027@space-calendar')).toBe('eta-aquariids');
    expect(showerOf('moon-phase-2027-01-07T20:24:00.000Z@space-calendar')).toBeNull();
  });
});
