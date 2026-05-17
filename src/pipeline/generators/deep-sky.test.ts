import { describe, it, expect } from 'vitest';
import { messierMarathonDate } from './deep-sky.ts';
import type { MoonPhase } from '../clients/usno.ts';

function phase(year: number, month: number, day: number, phase = 'New Moon'): MoonPhase {
  return { year, month, day, phase, time: '00:00' };
}

describe('messierMarathonDate', () => {
  it('picks the new moon on March 19 when one falls exactly on it', () => {
    const phases = [
      phase(2026, 2, 17),
      phase(2026, 3, 19),
      phase(2026, 4, 17),
    ];
    expect(messierMarathonDate(2026, phases)).toBe('2026-03-19');
  });

  it('picks the closer new moon when two straddle March 19', () => {
    const phases = [
      phase(2026, 3, 10), // 9 days before
      phase(2026, 4, 8),  // 20 days after
    ];
    expect(messierMarathonDate(2026, phases)).toBe('2026-03-10');
  });

  it('picks the April new moon when it is closer to March 19 than the March one', () => {
    const phases = [
      phase(2026, 3, 1),  // 18 days before
      phase(2026, 3, 30), // 11 days after
    ];
    expect(messierMarathonDate(2026, phases)).toBe('2026-03-30');
  });

  it('ignores non-new-moon phase entries', () => {
    const phases = [
      phase(2026, 3, 5,  'Full Moon'),
      phase(2026, 3, 19, 'New Moon'),
      phase(2026, 3, 26, 'Last Quarter'),
    ];
    expect(messierMarathonDate(2026, phases)).toBe('2026-03-19');
  });

  it('pads single-digit month and day', () => {
    const phases = [phase(2026, 3, 5)];
    expect(messierMarathonDate(2026, phases)).toBe('2026-03-05');
  });

  it('throws when no new moons are in the phase data', () => {
    const phases = [phase(2026, 3, 19, 'Full Moon')];
    expect(() => messierMarathonDate(2026, phases)).toThrow();
  });
});
