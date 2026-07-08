import type { NextConfig } from 'next';

const securityHeaders = [
 { key: 'X-DNS-Prefetch-Control', value: 'off' },
 { key: 'X-Frame-Options', value: 'DENY' },
 { key: 'X-Content-Type-Options', value: 'nosniff' },
 { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
 { key: 'Origin-Agent-Cluster', value: '?1' },
 { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
 {
 key: 'Permissions-Policy',
 value: 'camera=(), microphone=(), geolocation=(self), payment=()',
 },
 {
 key: 'Strict-Transport-Security',
 value: 'max-age=63072000; includeSubDomains; preload',
 },
 {
 key: 'Content-Security-Policy',
 value: [
 "default-src 'self'",
 "base-uri 'self'",
 "object-src 'none'",
 "manifest-src 'self'",
 "worker-src 'self' blob:",
 "child-src 'self' blob:",
 "frame-src 'self' blob:",
 "frame-ancestors 'none'",
 "img-src 'self' data: blob: https://*.supabase.co",
 "media-src 'self' blob:",
 "font-src 'self' data:",
 "style-src 'self' 'unsafe-inline'",
 "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com",
 "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.billplz.com https://www.billplz.com https://www.mobile88.com https://www.mobile88.com.my https://*.fiuu.com https://booster.fiuu.com https://va.vercel-scripts.com https://vitals.vercel-insights.com",
 "form-action 'self' https://*.billplz.com https://www.billplz.com https://www.mobile88.com https://www.mobile88.com.my https://*.fiuu.com https://booster.fiuu.com",
 'upgrade-insecure-requests',
 ].join('; '),
 },
];

const noStoreHeaders = [
 { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, proxy-revalidate' },
 { key: 'Pragma', value: 'no-cache' },
 { key: 'Expires', value: '0' },
];

const pwaManifestHeaders = [
 { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
];

const serviceWorkerHeaders = [
 { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
 { key: 'Service-Worker-Allowed', value: '/' },
];

const nextConfig: NextConfig = {
 async headers() {
 return [
 {
 source: '/(.*)',
 headers: securityHeaders,
 },
 {
 source: '/manifest.json',
 headers: pwaManifestHeaders,
 },
 {
 source: '/sw.js',
 headers: serviceWorkerHeaders,
 },
 {
 source: '/login',
 headers: noStoreHeaders,
 },
 {
 source: '/dashboard/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/pos/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/branches/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/factory/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/fleet/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/inventory/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/api/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/settings/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/hr/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/finance/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/maintenance/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/payroll/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/profile/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/reports/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/sales-agent/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/shifts/:path*',
 headers: noStoreHeaders,
 },
 {
 source: '/warehouse/:path*',
 headers: noStoreHeaders,
 },
 ];
 },
};

export default nextConfig;
