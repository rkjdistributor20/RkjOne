/**
 * Push .env.local vars to Vercel (production + preview).
 * Usage: node scripts/push-vercel-env.mjs [APP_URL]
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_APP_URL',
];

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

const env = loadEnvFile(path.join(ROOT, '.env.local'));
const appUrlOverride = process.argv[2];

if (appUrlOverride) {
  env.NEXT_PUBLIC_APP_URL = appUrlOverride;
}

function pushEnv(key, value, target) {
  const result = spawnSync('npx', ['vercel', 'env', 'add', key, target, '--force'], {
    cwd: ROOT,
    input: value,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    console.error(`✗ ${key} (${target}): ${result.stderr || result.stdout}`);
    return false;
  }
  console.log(`✓ ${key} → ${target}`);
  return true;
}

console.log('\n=== Push env ke Vercel ===\n');

let ok = true;
for (const key of KEYS) {
  const value = env[key];
  if (!value) {
    console.error(`✗ ${key} tiada dalam .env.local`);
    ok = false;
    continue;
  }
  for (const target of ['production', 'preview', 'development']) {
    if (!pushEnv(key, value, target)) ok = false;
  }
}

if (!ok) process.exit(1);
console.log('\nSelesai.\n');
