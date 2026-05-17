import { describe, it, expect } from 'vitest';
import { isNotableApproach } from './asteroids.ts';
import type { ParsedCloseApproach } from '../clients/jpl.ts';

function approach(dist_ld: number, h: number): ParsedCloseApproach {
  return { des: 'TEST', cd: '2026-Jan-01 00:00', dist_au: dist_ld / 389.17, dist_ld, v_rel_kms: 10, h };
}

describe('isNotableApproach', () => {
  describe('standard objects (dist > 1 LD)', () => {
    it('includes large objects within 10 LD', () => {
      expect(isNotableApproach(approach(5.0, 18))).toBe(true);
    });

    it('excludes small objects beyond 1 LD even within 10 LD', () => {
      expect(isNotableApproach(approach(5.0, 27))).toBe(false);
    });

    it('excludes large objects beyond 10 LD', () => {
      expect(isNotableApproach(approach(11.0, 18))).toBe(false);
    });

    it('includes large objects exactly at 10 LD boundary', () => {
      expect(isNotableApproach(approach(10.0, 22))).toBe(true);
    });
  });

  describe('sub-lunar objects (dist <= 1 LD)', () => {
    it('includes Chelyabinsk-class objects (H ~26, ~22m)', () => {
      expect(isNotableApproach(approach(0.5, 26))).toBe(true);
    });

    it('includes building-sized objects (H ~25, ~35m)', () => {
      expect(isNotableApproach(approach(0.23, 25))).toBe(true);
    });

    it('excludes very small objects that burn up (H > 26)', () => {
      expect(isNotableApproach(approach(0.5, 27))).toBe(false);
    });

    it('includes sub-lunar objects that also pass the standard H cutoff', () => {
      expect(isNotableApproach(approach(0.8, 22))).toBe(true);
    });

    it('includes objects exactly at 1 LD boundary with sub-lunar H cutoff', () => {
      expect(isNotableApproach(approach(1.0, 26))).toBe(true);
    });
  });
});
