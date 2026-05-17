import { describe, it, expect } from 'vitest';
import { moonPhaseOnDate, moonViewingNote } from './meteor-showers.ts';
import type { MoonPhase } from '../clients/usno.ts';

function newMoon(year: number, month: number, day: number): MoonPhase {
  return { year, month, day, phase: 'New Moon', time: '00:00' };
}

function fullMoon(year: number, month: number, day: number): MoonPhase {
  return { year, month, day, phase: 'Full Moon', time: '00:00' };
}

// Phases anchored to a known new moon on March 1 for easy arithmetic
const MARCH_PHASES: MoonPhase[] = [
  newMoon(2026, 3, 1),
  newMoon(2026, 3, 30),
];

describe('moonPhaseOnDate', () => {
  it('returns ~0% on a new moon date', () => {
    const { illumination } = moonPhaseOnDate('2026-03-01', MARCH_PHASES);
    expect(illumination).toBeLessThanOrEqual(5);
  });

  it('returns ~100% at the midpoint between two new moons (~15 days)', () => {
    const { illumination } = moonPhaseOnDate('2026-03-16', MARCH_PHASES);
    expect(illumination).toBeGreaterThanOrEqual(90);
  });

  it('returns ~50% at the quarter points (~7 days)', () => {
    const { illumination, isWaxing } = moonPhaseOnDate('2026-03-08', MARCH_PHASES);
    expect(illumination).toBeGreaterThanOrEqual(40);
    expect(illumination).toBeLessThanOrEqual(60);
    expect(isWaxing).toBe(true);
  });

  it('returns ~50% and waning at the last quarter (~22 days)', () => {
    const { illumination, isWaxing } = moonPhaseOnDate('2026-03-23', MARCH_PHASES);
    expect(illumination).toBeGreaterThanOrEqual(40);
    expect(illumination).toBeLessThanOrEqual(60);
    expect(isWaxing).toBe(false);
  });

  it('uses the actual cycle length between surrounding new moons', () => {
    // Cycle is 29 days (March 1 → March 30), so midpoint is March 15–16
    const { illumination } = moonPhaseOnDate('2026-03-15', MARCH_PHASES);
    expect(illumination).toBeGreaterThanOrEqual(85);
  });

  it('handles a date before the first new moon in the data', () => {
    const phases = [newMoon(2026, 1, 15)];
    const { illumination, isWaxing } = moonPhaseOnDate('2026-01-11', phases);
    // 4 days before new moon → waning crescent, low illumination
    expect(illumination).toBeLessThanOrEqual(25);
    expect(isWaxing).toBe(false);
  });

  it('ignores non-new-moon phases when finding surrounding moons', () => {
    const phases = [...MARCH_PHASES, fullMoon(2026, 3, 16)];
    const { illumination } = moonPhaseOnDate('2026-03-16', phases);
    expect(illumination).toBeGreaterThanOrEqual(90);
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

  it('mentions waxing crescent and sets for low waxing illumination', () => {
    const note = moonViewingNote(25, true);
    expect(note).toContain('waxing crescent');
    expect(note).toContain('sets');
  });

  it('mentions midnight for ~50% waxing (first quarter)', () => {
    const note = moonViewingNote(55, true);
    expect(note).toContain('midnight');
  });

  it('mentions waxing gibbous and pre-dawn for 75% waxing', () => {
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
