import type { LucideIcon } from 'lucide-react';
import {
 Banknote,
 Bot,
 ClipboardCheck,
 Database,
 GitBranch,
 GraduationCap,
 Handshake,
 Network,
 ShieldCheck,
 Sparkles,
 Truck,
 Users,
} from 'lucide-react';

export type AiLeader = {
 id: string;
 title: string;
 scope: string;
 mission: string;
 owns: string[];
 cadence: string;
 icon: LucideIcon;
 tone: 'gold' | 'emerald' | 'sky' | 'violet' | 'rose' | 'slate';
};

export type AiUpgradeRitual = {
 label: string;
 cadence: string;
 owner: string;
 outcome: string;
 status: 'active' | 'next' | 'watch';
};

export type AiGovernanceRule = {
 label: string;
 detail: string;
 owner: string;
};

export const AI_PROJECT_MANAGER_OFFICE = {
 updatedAt: '8 Jul 2026',
 headline: 'AI Project Manager Office',
 mission:
  'Barisan kepimpinan AI yang memantau RKJ One, susun backlog, check kesihatan sistem, cadang upgrade dan pastikan setiap modul siap ikut keutamaan bisnes.',
 operatingModel:
  'AI PMO bekerja sebagai layer pengurusan: AI cadang, semak dan susun kerja; Owner/Admin tetap beri kelulusan untuk perubahan production, akses data, bayaran, delete dan tindakan sensitif.',
 topCommand: [
  {
   id: 'ai-pm',
   title: 'AI Group Project Manager',
   scope: 'Ketua projek RKJ One',
   mission:
    'Pegang roadmap, pecahkan kerja kepada sprint, susun priority, pantau blocker dan pastikan setiap upgrade ada acceptance criteria.',
   owns: ['Roadmap', 'Sprint backlog', 'Daily status', 'Release decision pack'],
   cadence: 'Check harian + sprint mingguan',
   icon: Bot,
   tone: 'gold',
  },
  {
   id: 'ai-cto',
   title: 'AI CTO / System Architect',
   scope: 'Architecture dan technical direction',
   mission:
    'Semak struktur Next.js, Supabase, RBAC, database, API, performance dan scalability sebelum upgrade besar dibuat.',
   owns: ['Architecture map', 'Database design', 'Integration standard', 'Tech debt register'],
   cadence: 'Review sebelum setiap release',
   icon: Network,
   tone: 'sky',
  },
  {
   id: 'ai-qa',
   title: 'AI QA & UAT Director',
   scope: 'Quality gate sebelum production',
   mission:
    'Jalankan verify script, UAT browser, regression test, role access check dan simpan bukti sebelum sistem dianggap ready.',
   owns: ['verify:all', 'UAT browser', 'Bug triage', 'Release sign-off'],
   cadence: 'Setiap perubahan + sebelum deploy',
   icon: ClipboardCheck,
   tone: 'emerald',
  },
 ] satisfies AiLeader[],
 leaders: [
  {
   id: 'product',
   title: 'AI Product Director',
   scope: 'Requirement, workflow dan user experience',
   mission:
    'Tukar idea owner kepada requirement, user flow, acceptance criteria dan modul yang mudah digunakan staf sebenar.',
   owns: ['PRD', 'User journey', 'Workflow SOP', 'Feature priority'],
   cadence: 'Sprint planning',
   icon: Sparkles,
   tone: 'gold',
  },
  {
   id: 'data',
   title: 'AI Data & Integration Lead',
   scope: 'Full connection semua data online',
   mission:
    'Inventori semua data online, pilih connector terbaik, normalisasi data dan pastikan source of truth RKJ One bersih.',
   owns: ['Data inventory', 'Connector plan', 'Sync rules', 'Data quality report'],
   cadence: 'Check data mingguan',
   icon: Database,
   tone: 'sky',
  },
  {
   id: 'security',
   title: 'AI Security & Compliance Officer',
   scope: 'Auth, RLS, secret, audit dan privacy',
   mission:
    'Semak role access, RLS, token, file sensitif, audit log, backup dan risiko sebelum data atau payment diluaskan.',
   owns: ['Security checklist', 'RLS review', 'Secret handling', 'Backup/rollback'],
   cadence: 'Sebelum release + audit bulanan',
   icon: ShieldCheck,
   tone: 'rose',
  },
  {
   id: 'devops',
   title: 'AI DevOps & Release Manager',
   scope: 'GitHub, Vercel, Supabase migration',
   mission:
    'Urus branch, commit, build, deploy, health check, log scan dan rollback plan supaya production kekal stabil.',
   owns: ['Release notes', 'Deploy checklist', 'Vercel health', 'Rollback plan'],
   cadence: 'Setiap deploy',
   icon: GitBranch,
   tone: 'slate',
  },
  {
   id: 'ops',
   title: 'AI Operations Director',
   scope: '36 kiosk, warehouse, fleet, production',
   mission:
    'Pantau aliran Kilang -> HQ Distributor -> Driver -> Branch -> POS, termasuk stok, delivery, POD dan exception.',
   owns: ['Ops dashboard', 'Delivery SLA', 'Stock exceptions', 'Branch readiness'],
   cadence: 'Check harian operasi',
   icon: Truck,
   tone: 'emerald',
  },
  {
   id: 'finance',
   title: 'AI Finance & Payment Controller',
   scope: 'Tunai, QR, FPX, bank-in dan reconciliation',
   mission:
    'Pastikan collection, payment gateway, resit, outstanding cash dan bank confirmation tidak bercanggah.',
   owns: ['Cash reconciliation', 'FPX readiness', 'Bank-in tracking', 'Finance report'],
   cadence: 'Daily close + weekly audit',
   icon: Banknote,
   tone: 'gold',
  },
  {
   id: 'hr',
   title: 'AI HR & Payroll Lead',
   scope: 'Staff, HRMIS, shift, payroll 3 syarikat',
   mission:
    'Semak data staf, syif, attendance, payroll rules, payslip, cuti dan profil pekerja ikut entiti legal.',
   owns: ['HR data quality', 'Payroll proposal', 'Payslip readiness', 'Leave balance'],
   cadence: 'Mingguan payroll + bulanan HR',
   icon: Users,
   tone: 'violet',
  },
  {
   id: 'agent',
   title: 'AI Agent & Customer Success Lead',
   scope: 'Sales Agent, outlet POS dan support pengguna',
   mission:
    'Pantau ejen, order stok, subscription POS bulanan, onboarding dan isu support sebelum ganggu jualan.',
   owns: ['Agent UAT', 'Subscription health', 'Order funnel', 'Support follow-up'],
   cadence: 'Check mingguan + go-live support',
   icon: Handshake,
   tone: 'sky',
  },
  {
   id: 'docs-training',
   title: 'AI Documentation & Training Lead',
   scope: 'SOP, training dan handover',
   mission:
    'Pastikan setiap modul ada panduan BM ringkas, SOP role, checklist UAT dan bahan latihan staf.',
   owns: ['SOP BM', 'Training checklist', 'Release handover', 'FAQ'],
   cadence: 'Setiap modul siap',
   icon: GraduationCap,
   tone: 'emerald',
  },
 ] satisfies AiLeader[],
 rituals: [
  {
   label: 'Daily System Check',
   cadence: 'Setiap hari',
   owner: 'AI Group Project Manager',
   outcome: 'Semak health, error log, payment risk, pending approval dan blocker operasi.',
   status: 'active',
  },
  {
   label: 'Weekly Upgrade Sprint',
   cadence: 'Setiap minggu',
   owner: 'AI Product Director + AI CTO',
   outcome: 'Pilih 3-5 upgrade paling penting, siapkan acceptance criteria dan release plan.',
   status: 'active',
  },
  {
   label: 'Pre-Deploy Quality Gate',
   cadence: 'Sebelum push production',
   owner: 'AI QA & UAT Director',
   outcome: 'Run typecheck, lint, build, verify scripts, UAT browser dan log risiko.',
   status: 'active',
  },
  {
   label: 'Monthly Security & Data Audit',
   cadence: 'Bulanan',
   owner: 'AI Security + AI Data Lead',
   outcome: 'Semak RLS, secret, backup, data duplicate, orphan records dan access role.',
   status: 'next',
  },
  {
   label: 'Quarterly Architecture Review',
   cadence: 'Suku tahunan',
   owner: 'AI CTO / System Architect',
   outcome: 'Review scalability, database index, module coupling, cost, mobile readiness dan roadmap besar.',
   status: 'watch',
  },
 ] satisfies AiUpgradeRitual[],
 governance: [
  {
   label: 'AI tidak approve tindakan sensitif sendiri',
   detail:
    'Delete data besar, payment live, credential, role permission dan production rollback perlu kelulusan Owner/Admin.',
   owner: 'AI Security & Compliance Officer',
  },
  {
   label: 'Setiap upgrade mesti ada bukti',
   detail:
    'Commit, build result, verify command, UAT note dan deployment ID perlu direkod sebelum kerja dianggap siap.',
   owner: 'AI QA & UAT Director',
  },
  {
   label: 'Data online disambung satu sumber demi satu',
   detail:
    'Setiap connector perlu owner, source, sync method, sensitivity label dan rollback/import test.',
   owner: 'AI Data & Integration Lead',
  },
  {
   label: 'Production kekal stabil',
   detail:
    'Perubahan kecil, scoped diff, tiada credential dalam git, dan rollback plan untuk release berisiko.',
   owner: 'AI DevOps & Release Manager',
  },
 ] satisfies AiGovernanceRule[],
} as const;
