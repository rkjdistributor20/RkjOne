import { NextResponse } from 'next/server';

export function privateCacheHeader(maxAgeSeconds: number, staleWhileRevalidateSeconds: number) {
 return `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;
}

export function jsonWithPrivateCache<T>(
 body: T,
 maxAgeSeconds: number,
 staleWhileRevalidateSeconds: number,
 init?: ResponseInit) {
 const response = NextResponse.json(body, init);
 response.headers.set('Cache-Control', privateCacheHeader(maxAgeSeconds, staleWhileRevalidateSeconds));
 return response;
}
