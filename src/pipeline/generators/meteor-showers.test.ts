import { describe, it, expect } from 'vitest';
import { moonPhaseOnDate, moonViewingNote } from './meteor-showers.ts';

describe('moonPhaseOnDate', () => {
  it('returns near-zero illumination on a known new moon (2026-03-19)', () => {
    const { illumination } = moonPhaseOnDate('2026-03-19');
    expect(illumination).toBeLessThanOrEqual(5);
  });

  it('returns near-100% illumination ~15 days after new moon (2026-04-03)', () => {
    const { illumination } = moonPhaseOnDate('2026-04-03');
    expect(illumination).toBeGreaterThanOrEqual(95);
  });

  it('returns ~50% illumination ~7 days after new moon (first quarter)', () => {
    const { illumination, isWaxing } = moonPhaseOnDate('2026-03-26');
    expect(illumination).toBeGreaterThanOrEqual(40);
    expect(illumination).toBeLessThanOrEqual(60);
    expect(isWaxing).toBe(true);
  });

  it('returns ~50% illumination ~22 days after new moon (last quarter)', () => {
    const { illumination, isWaxing } = moonPhaseOnDate('2026-04-10');
    expect(illumination).toBeGreaterThanOrEqual(40);
    expect(illumination).toBeLessThanOrEqual(60);
    expect(isWaxing).toBe(false);
  });

  it('marks waxing for dates in the first half of the cycle', () => {
    expect(moonPhaseOnDate('2026-03-26').isWaxing).toBe(true);
  });

  it('marks waning for dates in the second half of the cycle', () => {
    expect(moonPhaseOnDate('2026-04-10').isWaxing).toBe(false);
  });
});

describe('moonViewingNote', () => {
  it('reports excellent conditions near new moon', () => {
    const note = moonViewingNote(3, false);
    expect(note).toContain('new moon');
    expect(note.toLowerCase()).toContain('dark skies');
  });

  it('reports poor conditions near full moon', () => {
    const note = moonViewingNote(97, false);
    expect(note).toContain('full moon');
  });

  it('mentions sets for waxing crescent', () => {
    const note = moonViewingNote(25, true);
    expect(note).toContain('waxing crescent');
    expect(note).toContain('sets');
  });

  it('mentions first quarter and midnight for ~50% waxing', () => {
    const note = moonViewingNote(55, true);
    expect(note).toContain('midnight');
  });

  it('mentions waxing gibbous pre-dawn for 75% waxing', () => {
    const note = moonViewingNote(75, true);
    expect(note).toContain('waxing gibbous');
    expect(note).toContain('pre-dawn');
  });

  it('mentions waning gibbous and evening for 75% waning', () => {
    const note = moonViewingNote(75, false);
    expect(note).toContain('waning gibbous');
    expect(note).toContain('evening');
  });

  it('mentions last quarter and midnight for ~50% waning', () => {
    const note = moonViewingNote(50, false);
    expect(note).toContain('last quarter');
    expect(note).toContain('midnight');
  });

  it('mentions waning crescent and dawn for 25% waning', () => {
    const note = moonViewingNote(25, false);
    expect(note).toContain('waning crescent');
    expect(note).toContain('dawn');
  });
});
