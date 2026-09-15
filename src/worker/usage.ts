import { recoverEmbeddedParams } from './params.ts';
import type { Env } from './types.ts';

/** One row per feed request, written to Workers Analytics Engine.
 *
 *  Workers Logs already record every request, but they keep seven days and redact the
 *  request URL: any run of 32 or more hex digits and separators becomes the word REDACTED,
 *  which is exactly the shape of the UUIDv7 `sid` — so the one field that tells
 *  subscriptions apart and dates them never survives into the logs. Analytics Engine stores
 *  what it is given, verbatim, for three months, so the usage archive reads from here.
 *
 *  Columns are positional (blob1, blob2, … in SQL), so the order of these lists is the
 *  schema. Append, never reorder: a query written against today's layout must keep reading
 *  rows written last month. The usage tool carries a copy of this order.
 *
 *  The client IP is deliberately not recorded. The network it belongs to (`asOrganization`)
 *  and the city Cloudflare resolves it to answer "who is using this" without keeping an
 *  address that identifies a household. */
export const USAGE_BLOBS = [
  'sid',
  'url',
  'path',
  'utm_source',
  'user_agent',
  'network',
  'country',
  'region',
  'city',
  'colo',
] as const;

export const USAGE_DOUBLES = ['status', 'asn', 'conditional', 'cache_hit'] as const;

export interface UsageOutcome {
  status: number;
  /** Whether the body came from the edge cache rather than being built. */
  cacheHit: boolean;
}

export interface UsagePoint {
  /** The sid, so sampling — should it ever kick in — is per subscription, not global. */
  indexes: [string];
  blobs: string[];
  doubles: number[];
}

export function usagePoint(request: Request, outcome: UsageOutcome): UsagePoint {
  const url = new URL(request.url);
  // Recovered the same way the feed parser does, so a sid swallowed into `c=` by a link
  // rewriter is still the subscription's id rather than an untagged request.
  const params = recoverEmbeddedParams(url.searchParams);
  const cf = (request as Request & { cf?: IncomingRequestCfProperties }).cf;
  const text = (value: unknown) => (value === undefined || value === null ? '' : String(value));

  const sid = params.get('sid')?.trim() ?? '';
  const blobs: Record<(typeof USAGE_BLOBS)[number], string> = {
    sid,
    url: request.url,
    path: url.pathname,
    utm_source: params.get('utm_source')?.trim() ?? '',
    user_agent: request.headers.get('User-Agent') ?? '',
    network: text(cf?.asOrganization),
    country: text(cf?.country),
    region: text(cf?.region),
    city: text(cf?.city),
    colo: text(cf?.colo),
  };
  const doubles: Record<(typeof USAGE_DOUBLES)[number], number> = {
    status: outcome.status,
    asn: Number(cf?.asn ?? 0) || 0,
    conditional: request.headers.has('If-None-Match') ? 1 : 0,
    cache_hit: outcome.cacheHit ? 1 : 0,
  };

  return {
    indexes: [sid],
    blobs: USAGE_BLOBS.map((name) => blobs[name]),
    doubles: USAGE_DOUBLES.map((name) => doubles[name]),
  };
}

/** Record a feed request. Fire-and-forget: the write is buffered by the runtime, and a
 *  failure here is an analytics gap, never a failed feed. */
export function recordUsage(env: Env, request: Request, outcome: UsageOutcome): void {
  if (!env.USAGE) return;
  try {
    env.USAGE.writeDataPoint(usagePoint(request, outcome));
  } catch (err) {
    console.warn('Usage data point not written:', err);
  }
}
