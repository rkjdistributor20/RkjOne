/**
 * RKJ One production smoke check.
 * Usage: npm run smoke:production
 */

const PRODUCTION_URL = (process.env.PRODUCTION_URL ?? 'https://rkj-one.vercel.app').replace(/\/$/, '');
const UUID = '00000000-0000-0000-0000-000000000000';

const checks = [];

function record(name, pass, detail) {
 checks.push({ name, pass, detail });
 const status = pass ? 'PASS' : 'FAIL';
 console.log(`${status} ${name}${detail ? ` - ${detail}` : ''}`);
}

async function request(path, options = {}) {
 const controller = new AbortController();
 const timer = setTimeout(() => controller.abort(), 30000);
 try {
 const response = await fetch(`${PRODUCTION_URL}${path}`, {
 redirect: 'manual',
 signal: controller.signal,
 ...options,
 headers: {
 ...(options.body ? { 'content-type': 'application/json' } : {}),
 ...(options.headers ?? {}),
 },
 });
 return response;
 } finally {
 clearTimeout(timer);
 }
}

async function expectStatus(name, path, expectedStatus, options = {}) {
 try {
 const response = await request(path, options);
 record(name, response.status === expectedStatus, `HTTP ${response.status}`);
 } catch (error) {
 record(name, false, error instanceof Error ? error.message : String(error));
 }
}

console.log(`\nRKJ One production smoke: ${PRODUCTION_URL}\n`);

await expectStatus('login page', '/login', 200);

await expectStatus('payment create rejects anonymous user', '/api/sales-agent/payments', 401, {
 method: 'POST',
 body: JSON.stringify({
 purpose: 'STOCK_ORDER',
 reference_id: UUID,
 payment_method: 'FPX',
 }),
});

await expectStatus(
 'payment status rejects anonymous user',
 `/api/sales-agent/payments/${UUID}/status`,
 401);

await expectStatus(
 'payment cancel rejects anonymous user',
 `/api/sales-agent/payments/${UUID}/cancel`,
 401,
 { method: 'POST', body: '{}' });

await expectStatus(
 'payment refund rejects anonymous user',
 `/api/sales-agent/payments/${UUID}/refund`,
 401,
 { method: 'POST', body: '{}' });

await expectStatus('payment webhook rejects bad signature', '/api/sales-agent/payments/webhook', 401, {
 method: 'POST',
 headers: { 'x-payment-signature': 'bad-signature' },
 body: JSON.stringify({ payment_id: UUID, status: 'PAID' }),
});

try {
 const response = await request('/api/health');
 if (!response.ok) {
 record('api health', false, `HTTP ${response.status}`);
 } else {
 const body = await response.json().catch(() => ({}));
 record('api health', body.ok === true || body.status === 'ok', JSON.stringify(body));
 }
} catch (error) {
 record('api health', false, error instanceof Error ? error.message : String(error));
}

const failed = checks.filter((check) => !check.pass);
console.log(`\nSummary: ${checks.length - failed.length} passed, ${failed.length} failed.`);

if (failed.length > 0) {
 process.exit(1);
}
