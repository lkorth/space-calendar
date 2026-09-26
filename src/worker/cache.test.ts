import { describe, it, expect } from 'vitest';
import { liveKvKey } from './cache.ts';

describe('liveKvKey', () => {
  it('suffixes the key with the deploy ID', () => {
    expect(liveKvKey({ DEPLOY_ID: 'abc1234' }, 'aurora:45')).toBe('aurora:45:abc1234');
  });

  it('gives different deploys different keys', () => {
    expect(liveKvKey({ DEPLOY_ID: 'abc1234' }, 'launches'))
      .not.toBe(liveKvKey({ DEPLOY_ID: 'def5678' }, 'launches'));
  });

  it('returns the bare key when no deploy ID is set (local dev and tests)', () => {
    expect(liveKvKey({}, 'launches')).toBe('launches');
  });
});
