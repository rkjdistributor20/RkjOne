export type ProjectMemoryMetric = {
 label: string;
 value: string;
 detail: string;
 tone?: 'default' | 'success' | 'warning';
};

export type ProjectMemoryItem = {
 title: string;
 detail: string;
 status?: 'done' | 'watch' | 'pending';
};

export type ProjectMemoryConnection = {
 label: string;
 value: string;
 detail: string;
 href?: string;
};

export const RKJ_ONE_PROJECT_MEMORY = {
 updatedAt: '8 Jul 2026',
 source: 'Cursor/Codex chat: Siapkan project RKJOne di Cursor + RESUME.md + CHECKPOINT.json',
 purpose:
 'Production-ready ERP RKJ One untuk Roti Kaya Junus: POS, inventory, fleet, warehouse, payroll, finance, reporting, HR, ejen, PWA dan go-live 36 cawangan.',
 architecture: [
  'Next.js App Router, TypeScript, Tailwind CSS, shadcn/ui',
  'Supabase PostgreSQL, Auth, Storage, Realtime, RLS dan migrations',
  'Vercel production deployment, PWA dan Capacitor mobile shell',
  'Multi-tenant, RBAC, dashboard ikut peranan, offline-capable POS',
 ],
 company: [
  'HQ Teluk Intan, 36 kiosk dalam tiga kawasan operasi',
  'Utara: Safuan, Tengah: Hakim, Selatan: Yati',
  'Tiga entiti legal: RKJ, RKJ Distributor, RKJ Manufacturing',
  'Owner/Super Admin: Mat Isa; Admin: Norashikin; HR: Mohd Ali',
 ],
 modules: [
  'POS: cash, QR, mixed payment, receipt, open/close shift, void, refund, history, daily summary',
  'Shift: flexible shift, working hours, attendance, salary dan OT',
  'Inventory: factory, HQ warehouse, fleet vehicle, branch kiosk, receive, transfer, count, write-off',
  'Fleet/Warehouse: factory to HQ to vehicle to branch, POD, receiver signature dan images',
  'Payroll: pekerja asing, tempatan, commission tiers, 3 syarikat, payslip dan HR portal',
  'Finance/Reporting: collection, bank-in, reconciliation, daily/weekly/monthly performance',
  'Sales Agent: order stok, bayaran FPX/kad melalui gateway, resit AR, langganan POS bulanan',
 ],
 metrics: [
  {
   label: 'Production',
   value: 'Live',
   detail: 'https://rkj-one.vercel.app',
   tone: 'success',
  },
  {
   label: 'Automated UAT',
   value: '6/6',
   detail: 'verify:all lulus',
   tone: 'success',
  },
  {
   label: 'Readiness',
   value: '14/14',
   detail: 'verify:readiness lulus',
   tone: 'success',
  },
  {
   label: 'Mobile/PWA',
   value: '54/54',
   detail: 'mobile:readiness lulus',
   tone: 'success',
  },
 ] satisfies ProjectMemoryMetric[],
 connections: [
  {
   label: 'GitHub',
   value: 'master production branch',
   detail: 'Push ke master trigger deployment RKJ One',
   href: 'https://github.com/rkjdistributor20/RkjOne',
  },
  {
   label: 'Vercel',
   value: 'rkj-one.vercel.app',
   detail: 'Production alias ikut deployment Ready terkini',
   href: 'https://rkj-one.vercel.app',
  },
  {
   label: 'Supabase',
   value: 'mtygxueknokcihofdttl',
   detail: 'Migrations 00001-00111 applied',
  },
  {
   label: 'Codex/Cursor',
   value: 'RESUME.md + CHECKPOINT.json',
   detail: 'Chat tidak sync automatik; continuity melalui Git dan checkpoint',
  },
 ] satisfies ProjectMemoryConnection[],
 completed: [
  {
   title: 'Dashboard role dan AI Proactive Cockpit',
   detail:
    'SOP harian, SLA, exception flow, approval matrix, handoff antara Owner/Admin, HQ Distributor, Driver, OM, AM, Staff, HR, Finance dan Ejen.',
   status: 'done',
  },
  {
   title: 'Production Readiness Center',
   detail:
    'Tetapan > Kesihatan Sistem ada Launch Control, UAT owner, status badge, KPI, readiness, owner/action text dan BM/EN.',
   status: 'done',
  },
  {
   title: 'Payroll Studio 3 syarikat',
   detail:
    'Company-scoped payroll, gaji pekerja asing/tempatan, commission, payslip preview, portal staf HR & gaji.',
   status: 'done',
  },
  {
   title: 'HRMIS self-service',
   detail:
    'Profil pekerja, cuti, dokumen, baki cuti dan UAT automatik HR/HRMIS lulus.',
   status: 'done',
  },
  {
   title: 'Sales Agent dan bayaran',
   detail:
    'Order stok, resit AR, POS outlet, langganan bulanan; production perlu pengesahan bank/gateway sebelum order dianggap berjaya.',
   status: 'watch',
  },
  {
   title: 'Mobile/PWA dan app shell',
   detail:
    'Service worker, manifest, Capacitor shell dan mobile readiness 54/54.',
   status: 'done',
  },
 ] satisfies ProjectMemoryItem[],
 pending: [
  {
   title: 'UAT browser semua dashboard',
   detail:
    'Semak dashboard Owner/Admin, AM Utara/Tengah/Selatan, HR, Finance, Warehouse, Fleet, Factory, POS dan Ejen selepas redesign.',
   status: 'pending',
  },
  {
   title: 'UAT manual Sales Agent dan AM',
   detail:
    'Ikut docs/UAT_SALES_AGENT.md dan docs/UAT_AM.md untuk flow order, resit, kawasan dan akses role.',
   status: 'pending',
  },
  {
   title: 'FPX live',
   detail:
    'Masukkan Merchant Code/API key iPay88 di Vercel; payment hanya sah selepas confirmation gateway/bank.',
   status: 'watch',
  },
  {
   title: 'Supabase lockdown dan Hari H',
   detail:
    'Pastikan signup OFF, backup/checkpoint dibuat, kemudian go-live 36 cawangan.',
   status: 'pending',
  },
  {
   title: 'Reconnect Gmail untuk D-U-N-S monitoring',
   detail:
    'Sambung semula monitoring email bila connector tersedia.',
   status: 'pending',
  },
 ] satisfies ProjectMemoryItem[],
 verifyCommands: [
  'npm run verify:readiness',
  'npm run verify:all',
  'npm run verify:production',
  'npm run uat:full',
  'npm run uat:am',
  'npm run uat:sales-agent:flow',
  'npm run mobile:readiness',
 ],
 securityNote:
  'Credential, token, password UAT/owner dan output sensitif tidak dipaparkan di dashboard. Rujukan kekal dalam fail local yang gitignored atau secret manager.',
} as const;
