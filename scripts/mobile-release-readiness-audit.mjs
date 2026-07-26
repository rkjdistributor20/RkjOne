/**
 * Read-only release readiness audit for RKJ One mobile/PWA store submission.
 *
 * It verifies production health, local mobile artifacts, store review account,
 * branch-scoped reviewer access, POS read APIs, role permission matrix, and
 * release/security documentation without printing secrets.
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { loadProjectEnv } from './lib/load-env.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'outputs', 'mobile-release');
const REPORT_JSON = path.join(OUT_DIR, 'release-readiness-audit.json');
const REPORT_MD = path.join(OUT_DIR, 'release-readiness-audit.md');

const PRODUCTION_URL = process.env.PRODUCTION_URL ?? 'https://rkj.one';
const REVIEWER_FILE = path.join(OUT_DIR, 'play-store-reviewer-account.json');
const REQUIRED_DOCS = [
  'docs/mobile/PLAY_STORE_SUBMISSION.md',
  'docs/mobile/APP_STORE_SUBMISSION.md',
  'docs/mobile/APPLE_ACCOUNT_GUIDE.md',
  'docs/mobile/DATA_SAFETY.md',
  'docs/mobile/RELEASE_CHECKLIST.md',
  'docs/MOBILE_APP_RELEASE.md',
  'app/privacy/page.tsx',
  'app/support/page.tsx',
  'app/delete-account/page.tsx',
  'app/terms/page.tsx',
];
const REQUIRED_ASSETS = [
  'outputs/mobile-release/builds/rkj-one-staff-v1.0-release.aab',
  'outputs/mobile-release/store-assets/01-secure-login.png',
  'outputs/mobile-release/store-assets/02-pos-counter.png',
  'outputs/mobile-release/store-assets/03-branch-operations.png',
  'outputs/mobile-release/store-assets/04-hr-payroll.png',
  'outputs/mobile-release/store-assets/05-logistics-agent.png',
  'outputs/mobile-release/store-assets/play-store-feature-graphic.png',
  'public/manifest.json',
  'public/sw.js',
  'public/app-icon-512.png',
  'ios/App/App/Info.plist',
  'capacitor.config.ts',
];
const APP_STORE_SCREENSHOTS = [
  'outputs/mobile-release/app-store-assets/iphone-6.9/01-secure-login.png',
  'outputs/mobile-release/app-store-assets/iphone-6.9/02-pos-counter.png',
  'outputs/mobile-release/app-store-assets/iphone-6.9/03-branch-operations.png',
  'outputs/mobile-release/app-store-assets/iphone-6.9/04-hr-payroll.png',
  'outputs/mobile-release/app-store-assets/iphone-6.9/05-logistics-agent.png',
];
const POS_COUNT_CODES = [
  'ST-PLANTA',
  'ST-KELAPA',
  'ST-KACANG',
  'ST-BENGGALI',
  'ST-KAYA',
  'ST-BUTTER',
];
const PERMISSION_EXPECTATIONS = [
  { role: 'STAFF', module: 'pos', min: 'OWN' },
  { role: 'STAFF', module: 'stock_kiosk', min: 'OWN' },
  { role: 'STAFF', module: 'hr', max: 'NONE' },
  { role: 'STAFF', module: 'finance', max: 'NONE' },
  { role: 'AREA_MANAGER', module: 'stock_kiosk', min: 'VIEW_AREA' },
  { role: 'AREA_MANAGER', module: 'shift', min: 'VIEW_AREA' },
  { role: 'SALES_AGENT', module: 'sales_agent', min: 'VIEW' },
  { role: 'HR', module: 'hr', min: 'VIEW' },
  { role: 'FINANCE', module: 'finance', min: 'VIEW' },
];
const PERMISSION_RANK = {
  NONE: 0,
  VIEW: 1,
  VIEW_AREA: 2,
  OWN: 3,
  FULL_OWN: 4,
  FULL: 5,
};

const results = [];

function rel(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function record(area, check, ok, detail = '', severity = 'error') {
  results.push({ area, check, ok, detail, severity });
  const mark = ok ? '✓' : severity === 'warn' ? '!' : '✗';
  console.log(` ${mark} ${area} - ${check}${detail ? `: ${detail}` : ''}`);
}

function fileExists(relativePath, minBytes = 1) {
  const full = path.join(ROOT, relativePath);
  return fs.existsSync(full) && fs.statSync(full).size >= minBytes;
}

function authCookie(supabaseUrl, session, user) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  return `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    token_type: 'bearer',
    user,
  }))}`;
}

async function getJson(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
    redirect: 'manual',
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text.slice(0, 300);
  }
  return { ok: res.ok, status: res.status, body };
}

async function getText(url) {
  const res = await fetch(url, { redirect: 'manual' });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, text };
}

function includesAll(haystack, needles) {
  const text = String(haystack ?? '');
  return needles.every((needle) => text.includes(needle));
}

async function main() {
  console.log('\n=== RKJ One Mobile Release Readiness Audit ===\n');

  const env = loadProjectEnv();
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  record('Env', 'Supabase URL configured', Boolean(supabaseUrl));
  record('Env', 'Supabase anon key configured', Boolean(anonKey));
  record('Env', 'Supabase service key configured locally', Boolean(serviceKey));

  if (!supabaseUrl || !anonKey || !serviceKey) {
    throw new Error('Missing Supabase env. Audit cannot continue.');
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const anon = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('\n--- Production/PWA ---');
  const health = await getJson(`${PRODUCTION_URL}/api/health`);
  record('Production', '/api/health', health.ok, `HTTP ${health.status}`);

  const manifest = await getJson(`${PRODUCTION_URL}/manifest.json`);
  record(
    'PWA',
    'manifest live',
    manifest.ok && manifest.body?.name === 'RKJ One Staff',
    manifest.ok ? String(manifest.body?.name ?? 'unknown') : `HTTP ${manifest.status}`,
  );

  const privacy = await getText(`${PRODUCTION_URL}/privacy`);
  record('PWA', 'privacy policy live', privacy.ok && privacy.text.includes('RKJ One'), `HTTP ${privacy.status}`);

  const support = await getText(`${PRODUCTION_URL}/support`);
  record('PWA', 'support page live', support.ok && support.text.includes('developer@rkj.one'), `HTTP ${support.status}`);

  const deletion = await getText(`${PRODUCTION_URL}/delete-account`);
  record('PWA', 'account deletion page live', deletion.ok && deletion.text.includes('Pemadaman Akaun'), `HTTP ${deletion.status}`);

  const terms = await getText(`${PRODUCTION_URL}/terms`);
  record('PWA', 'terms page live', terms.ok && terms.text.includes('Terma Penggunaan'), `HTTP ${terms.status}`);

  const offline = await getText(`${PRODUCTION_URL}/offline`);
  record('PWA', 'offline fallback live', offline.ok, `HTTP ${offline.status}`);

  console.log('\n--- Local Mobile Artifacts ---');
  for (const asset of REQUIRED_ASSETS) {
    const ok = fileExists(asset, asset.endsWith('.png') ? 1000 : 1);
    record('Artifact', asset, ok, ok ? 'ready' : 'missing', asset.includes('ios/') ? 'warn' : 'error');
  }
  for (const asset of APP_STORE_SCREENSHOTS) {
    const full = path.join(ROOT, asset);
    let metadata = null;
    if (fileExists(asset, 1000)) metadata = await sharp(full).metadata();
    const ok = metadata?.width === 1290 && metadata?.height === 2796 && metadata?.hasAlpha === false;
    record(
      'App Store Artifact',
      asset,
      ok,
      metadata
        ? `${metadata.width}x${metadata.height}; alpha=${metadata.hasAlpha}`
        : 'missing',
    );
  }

  console.log('\n--- Store Documents ---');
  for (const doc of REQUIRED_DOCS) {
    record('Docs', doc, fileExists(doc), fileExists(doc) ? 'ready' : 'missing');
  }

  const appStoreDoc = fs.existsSync(path.join(ROOT, 'docs/mobile/APP_STORE_SUBMISSION.md'))
    ? fs.readFileSync(path.join(ROOT, 'docs/mobile/APP_STORE_SUBMISSION.md'), 'utf8')
    : '';
  record(
    'Docs',
    'App Store copy includes Custom App/review/privacy',
    includesAll(appStoreDoc, ['Custom App', 'App Review Notes', 'App Privacy Answers']),
  );

  console.log('\n--- Supabase Master Data ---');
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .select('id, code, name')
    .eq('code', 'RKJ')
    .single();
  record('Supabase', 'organization RKJ', !orgError && Boolean(org), org?.name ?? orgError?.message ?? '');

  const { data: legalEntities, error: legalError } = await admin
    .from('legal_entities')
    .select('id, code, legal_name, status')
    .eq('organization_id', org?.id ?? '');
  const legalCodes = new Set((legalEntities ?? []).map((row) => row.code));
  record(
    'Supabase',
    '3 legal entities',
    !legalError && ['RKJ', 'RKJ_DIST', 'RKJ_MFG'].every((code) => legalCodes.has(code)),
    [...legalCodes].join(', ') || legalError?.message,
  );

  const { data: branch, error: branchError } = await admin
    .from('branches')
    .select('id, branch_code, branch_name, status, region:regions(code, name)')
    .eq('organization_id', org?.id ?? '')
    .eq('branch_code', 'BR011')
    .single();
  record(
    'Supabase',
    'BR011 test branch',
    !branchError && Boolean(branch),
    branch ? `${branch.branch_code} - ${branch.branch_name}` : branchError?.message,
  );

  console.log('\n--- Reviewer Account ---');
  let reviewer = null;
  if (fs.existsSync(REVIEWER_FILE)) {
    reviewer = JSON.parse(fs.readFileSync(REVIEWER_FILE, 'utf8'));
    record('Reviewer', 'credential file exists', true, rel(REVIEWER_FILE));
  } else {
    record('Reviewer', 'credential file exists', false, 'run npm run mobile:reviewer');
  }

  let cookie = null;
  if (reviewer?.email && reviewer?.password) {
    const login = await anon.auth.signInWithPassword({
      email: reviewer.email,
      password: reviewer.password,
    });
    record('Reviewer', 'login works', !login.error && Boolean(login.data.session), login.error?.message ?? reviewer.email);

    if (login.data.session) {
      cookie = authCookie(supabaseUrl, login.data.session, login.data.user);
      const { data: reviewerProfile, error: reviewerProfileError } = await anon
        .from('profiles')
        .select('id, full_name, role, status, branch_id, legal_entity:legal_entities(code), branch:branches(branch_code, branch_name)')
        .eq('id', login.data.user.id)
        .single();

      const profileOk =
        !reviewerProfileError &&
        reviewerProfile?.role === 'STAFF' &&
        reviewerProfile?.status === 'ACTIVE' &&
        reviewerProfile?.branch?.branch_code === 'BR011' &&
        reviewerProfile?.legal_entity?.code === 'RKJ';
      record(
        'Reviewer',
        'scoped to RKJ BR011 staff',
        profileOk,
        reviewerProfile
          ? `${reviewerProfile.role} - ${reviewerProfile.branch?.branch_code ?? '?'} - ${reviewerProfile.legal_entity?.code ?? '?'}`
          : reviewerProfileError?.message,
      );
    }
  }

  console.log('\n--- POS Readiness (Reviewer / BR011) ---');
  if (cookie && branch?.id) {
    const profileApi = await getJson(`${PRODUCTION_URL}/api/profile`, { headers: { Cookie: cookie } });
    record('POS', 'profile API', profileApi.ok, `HTTP ${profileApi.status}`);

    const deviceApi = await getJson(`${PRODUCTION_URL}/api/pos/device`, { headers: { Cookie: cookie } });
    const reviewerTrainingMode = deviceApi.ok && deviceApi.body?.mode === 'TRAINING';
    record(
      'POS',
      'reviewer device mode',
      deviceApi.ok && ['TRAINING', 'PRODUCTION'].includes(deviceApi.body?.mode),
      reviewerTrainingMode ? 'TRAINING (no live sales)' : deviceApi.body?.mode ?? `HTTP ${deviceApi.status}`,
    );

    const productsApi = await getJson(`${PRODUCTION_URL}/api/pos/products?branch_id=${branch.id}`, { headers: { Cookie: cookie } });
    const productCount = productsApi.body?.products?.length ?? 0;
    record('POS', 'products API has active menu', productsApi.ok && productCount > 0, `${productCount} products`);

    const stockSopApi = await getJson(`${PRODUCTION_URL}/api/pos/stock-sop?branch_id=${branch.id}`, { headers: { Cookie: cookie } });
    const estimateCodes = new Set((stockSopApi.body?.stockEstimate?.items ?? []).map((item) => item.item_code));
    record(
      'POS',
      'stock SOP API',
      stockSopApi.ok,
      stockSopApi.ok ? `${stockSopApi.body?.pendingDeliveryCount ?? 0} pending delivery` : `HTTP ${stockSopApi.status}`,
    );
    record(
      'POS',
      'stock SOP uses official shift count items',
      stockSopApi.ok && POS_COUNT_CODES.every((code) => estimateCodes.has(code)),
      [...estimateCodes].join(', ') || 'no estimate items',
      'warn',
    );

    if (reviewerTrainingMode) {
      record('POS', 'live shift isolation', true, 'training mode intentionally skips live shift data');
    } else {
      const shiftApi = await getJson(`${PRODUCTION_URL}/api/pos/shift?branch_id=${branch.id}`, { headers: { Cookie: cookie } });
      record(
        'POS',
        'shift API responds',
        shiftApi.ok,
        shiftApi.body?.shift ? `open: ${shiftApi.body.shift.shift_number}` : 'ready; no open shift',
      );
    }

    const summaryApi = await getJson(`${PRODUCTION_URL}/api/pos/summary?branch_id=${branch.id}`, { headers: { Cookie: cookie } });
    const hasWorkFields = summaryApi.ok && Object.prototype.hasOwnProperty.call(summaryApi.body?.summary ?? {}, 'business_started_at');
    record('POS', 'daily summary includes business/payroll time fields', hasWorkFields, `HTTP ${summaryApi.status}`);
  } else {
    record('POS', 'reviewer POS API checks', false, 'missing reviewer cookie or BR011', 'warn');
  }

  console.log('\n--- Role / Access Matrix ---');
  const { data: profilesByRole, error: profileRoleError } = await admin
    .from('profiles')
    .select('role, status, legal_entity:legal_entities(code)')
    .eq('organization_id', org?.id ?? '')
    .eq('status', 'ACTIVE');
  if (profileRoleError) {
    record('Access', 'profile role summary', false, profileRoleError.message);
  } else {
    const counts = new Map();
    for (const row of profilesByRole ?? []) {
      const key = `${row.role}:${row.legal_entity?.code ?? 'NO_ENTITY'}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    record('Access', 'active profiles have roles/legal entities', counts.size > 0, [...counts.entries()].slice(0, 10).map(([k, v]) => `${k}=${v}`).join(', '));
  }

  const { data: rolePermissions, error: rolePermError } = await admin
    .from('role_permissions')
    .select('role, module, permission')
    .eq('organization_id', org?.id ?? '');
  if (rolePermError) {
    record('Access', 'role permissions query', false, rolePermError.message);
  } else {
    const permissionMap = new Map((rolePermissions ?? []).map((row) => [`${row.role}:${row.module}`, row.permission]));
    for (const expectation of PERMISSION_EXPECTATIONS) {
      const actual = permissionMap.get(`${expectation.role}:${expectation.module}`) ?? 'NONE';
      let ok = true;
      if (expectation.min) ok = PERMISSION_RANK[actual] >= PERMISSION_RANK[expectation.min];
      if (expectation.max) ok = PERMISSION_RANK[actual] <= PERMISSION_RANK[expectation.max];
      record(
        'Access',
        `${expectation.role} ${expectation.module}`,
        ok,
        `${actual}${expectation.min ? ` >= ${expectation.min}` : ''}${expectation.max ? ` <= ${expectation.max}` : ''}`,
      );
    }
  }

  console.log('\n--- Security / Backup Readiness ---');
  const gitignore = fs.existsSync(path.join(ROOT, '.gitignore')) ? fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8') : '';
  record('Security', 'reviewer credential ignored by git', gitignore.includes('play-store-reviewer-account.*'));
  record('Security', 'Android release AAB exists', fileExists('outputs/mobile-release/builds/rkj-one-staff-v1.0-release.aab', 1000));
  record('Security', 'privacy hardening doc exists', fileExists('docs/PRIVACY_SECURITY_UPGRADE.md'), fileExists('docs/PRIVACY_SECURITY_UPGRADE.md') ? 'ready' : 'missing', 'warn');
  record('Backup', 'migration bundle script exists', fileExists('scripts/bundle-migrations.mjs'), 'ready');
  record('Backup', 'go-live checklist exists', fileExists('docs/GO_LIVE_CHECKLIST.md'), 'ready');

  const failures = results.filter((row) => !row.ok && row.severity !== 'warn').length;
  const warnings = results.filter((row) => !row.ok && row.severity === 'warn').length;
  const passed = results.filter((row) => row.ok).length;

  const report = {
    generated_at: new Date().toISOString(),
    production_url: PRODUCTION_URL,
    passed,
    warnings,
    failures,
    results,
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# RKJ One Mobile Release Readiness Audit',
      '',
      `Generated: ${report.generated_at}`,
      `Production URL: ${PRODUCTION_URL}`,
      '',
      `Passed: ${passed}`,
      `Warnings: ${warnings}`,
      `Failures: ${failures}`,
      '',
      '| Area | Check | Status | Detail |',
      '| --- | --- | --- | --- |',
      ...results.map((row) => `| ${row.area} | ${row.check.replaceAll('|', '/')} | ${row.ok ? 'PASS' : row.severity === 'warn' ? 'WARN' : 'FAIL'} | ${String(row.detail ?? '').replaceAll('|', '/')} |`),
      '',
    ].join('\n'),
    'utf8',
  );

  console.log('\n=== Audit Summary ===');
  console.log(` Passed: ${passed}`);
  console.log(` Warnings: ${warnings}`);
  console.log(` Failures: ${failures}`);
  console.log(` Report: ${rel(REPORT_MD)}`);

  if (failures > 0) process.exit(1);
}

main().catch((err) => {
  console.error(`\nAudit failed: ${err.message}`);
  process.exit(1);
});
