import { NextResponse } from 'next/server';

type Bucket = {
 count: number;
 resetAt: number;
};

type RateLimitOptions = {
 key: string;
 limit: number;
 windowMs: number;
 identity?: string | null;
};

const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 2000;

function clientIp(request: Request) {
 const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
 return (
 forwarded ||
 request.headers.get('cf-connecting-ip') ||
 request.headers.get('x-real-ip') ||
 'unknown'
 );
}

function cleanup(now: number) {
 if (buckets.size < MAX_BUCKETS) return;
 for (const [key, bucket] of buckets.entries()) {
 if (bucket.resetAt <= now) buckets.delete(key);
 if (buckets.size < MAX_BUCKETS) break;
 }
}

export function checkRateLimit(request: Request, options: RateLimitOptions) {
 const now = Date.now();
 cleanup(now);

 const identity = options.identity || clientIp(request);
 const bucketKey = `${options.key}:${identity}`;
 const existing = buckets.get(bucketKey);

 if (!existing || existing.resetAt <= now) {
 buckets.set(bucketKey, { count: 1, resetAt: now + options.windowMs });
 return { ok: true as const };
 }

 existing.count += 1;
 if (existing.count <= options.limit) return { ok: true as const };

 return {
 ok: false as const,
 retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
 };
}

export function rateLimitResponse(retryAfter: number) {
 return NextResponse.json(
 { error: 'Terlalu banyak percubaan. Sila cuba semula sebentar lagi.' },
 {
 status: 429,
 headers: {
 'Retry-After': String(retryAfter),
 },
 });
}

export function enforceRateLimit(request: Request, options: RateLimitOptions) {
 const result = checkRateLimit(request, options);
 return result.ok ? null : rateLimitResponse(result.retryAfter);
}
