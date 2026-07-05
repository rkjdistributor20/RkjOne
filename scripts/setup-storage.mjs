/**
 * Cipta storage buckets Supabase untuk go-live.
 * Usage: npm run setup:storage
 *
 * Perlu .env.local: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadEnvFile(filePath) {
 if (!fs.existsSync(filePath)) return {};
 const out = {};
 for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
 const trimmed = line.trim();
 if (!trimmed || trimmed.startsWith('#')) continue;
 const eq = trimmed.indexOf('=');
 if (eq === -1) continue;
 const key = trimmed.slice(0, eq).trim();
 let val = trimmed.slice(eq + 1).trim();
 if (
 (val.startsWith('"') && val.endsWith('"')) ||
 (val.startsWith("'") && val.endsWith("'"))
 ) {
 val = val.slice(1, -1);
 }
 out[key] = val;
 }
 return out;
}

const env = {
 ...loadEnvFile(path.join(ROOT, '.env')),
 ...loadEnvFile(path.join(ROOT, '.env.local')),
 ...process.env,
};

const url = env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
 console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
 process.exit(1);
}

const BUCKETS = [
 { name: 'delivery-proof', public: false },
 { name: 'bank-slips', public: false },
 { name: 'receipts', public: false },
 { name: 'profile-avatars', public: true },
];

async function ensureBucket({ name, public: isPublic }) {
 const res = await fetch(`${url}/storage/v1/bucket`, {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${serviceKey}`,
 'Content-Type': 'application/json',
 apikey: serviceKey,
 },
 body: JSON.stringify({ name, public: isPublic }),
 });

 if (res.ok) {
 console.log(`✓ Bucket "${name}" dicipta`);
 return;
 }

 const body = await res.text();
 if (res.status === 409 || body.includes('already exists')) {
 console.log(` - Bucket "${name}" sudah wujud`);
 return;
 }

 console.error(`✗ Bucket "${name}" gagal (${res.status}): ${body}`);
}

console.log('\n=== RKJ One - Setup Storage Buckets ===\n');
for (const bucket of BUCKETS) {
 await ensureBucket(bucket);
}
console.log('\nSelesai.\n');
