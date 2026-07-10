import { performance } from 'node:perf_hooks';
import process from 'node:process';

const baseUrl = (process.env.PERFORMANCE_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://rkj.one').replace(/\/$/, '');

const targets = [
 {
  name: 'login page',
  path: '/login',
  maxMs: 5000,
  expectedStatuses: [200],
 },
 {
  name: 'health api',
  path: '/api/health',
  maxMs: 2500,
  expectedStatuses: [200],
 },
 {
  name: 'dashboard auth gate',
  path: '/dashboard',
  maxMs: 3500,
  expectedStatuses: [307, 308],
  redirect: 'manual',
 },
 {
  name: 'hq distributor auth gate',
  path: '/warehouse',
  maxMs: 3500,
  expectedStatuses: [307, 308],
  redirect: 'manual',
 },
 {
  name: 'booking api auth gate',
  path: '/api/bookings',
  maxMs: 3000,
  expectedStatuses: [401],
 },
 {
  name: 'warehouse summary auth gate',
  path: '/api/warehouse/summary',
  maxMs: 3000,
  expectedStatuses: [401],
 },
 {
  name: 'sales agent catalog auth gate',
  path: '/api/sales-agent/catalog',
  maxMs: 3000,
  expectedStatuses: [401],
 },
];

async function timedFetch(target) {
 const url = `${baseUrl}${target.path}`;
 const startedAt = performance.now();
 const response = await fetch(url, {
  redirect: target.redirect ?? 'follow',
  headers: {
   'user-agent': 'rkj-one-performance-budget/1.0',
  },
 });
 const durationMs = Math.round(performance.now() - startedAt);
 await response.arrayBuffer();
 return { url, status: response.status, durationMs };
}

async function bestOfTwo(target) {
 const first = await timedFetch(target);
 const second = await timedFetch(target);
 return first.durationMs <= second.durationMs ? first : second;
}

let failed = 0;

console.log(`Performance budget target: ${baseUrl}`);

for (const target of targets) {
 try {
  const result = await bestOfTwo(target);
  const statusOk = target.expectedStatuses.includes(result.status);
  const timingOk = result.durationMs <= target.maxMs;
  const marker = statusOk && timingOk ? 'ok' : 'x';

  console.log(`${marker} ${target.name}: ${result.status} in ${result.durationMs}ms (budget ${target.maxMs}ms)`);

  if (!statusOk) {
   console.error(`  expected status: ${target.expectedStatuses.join(', ')}`);
   failed += 1;
  }

  if (!timingOk) {
   failed += 1;
  }
 } catch (error) {
  failed += 1;
  console.error(`x ${target.name}: ${(error instanceof Error ? error.message : String(error))}`);
 }
}

if (failed > 0) {
 console.error(`\nPerformance budget failed: ${failed} issue(s).`);
 process.exit(1);
}

console.log('Performance budget passed.');
