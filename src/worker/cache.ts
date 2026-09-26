import type { Env } from './types.ts';

/** KV key for data the worker itself caches (live categories). Suffixing the deploy ID
 *  means a new deploy never reads entries serialized by older code — whose shape or
 *  filtering may no longer match — and instead refetches. Old entries expire via TTL. */
export function liveKvKey(env: Pick<Env, 'DEPLOY_ID'>, key: string): string {
  return env.DEPLOY_ID ? `${key}:${env.DEPLOY_ID}` : key;
}
