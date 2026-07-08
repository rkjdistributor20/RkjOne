'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
 AlertCircle,
 Banknote,
 BriefcaseBusiness,
 Building2,
 CalendarClock,
 CheckCircle2,
 ClipboardList,
 Clock3,
 FileCheck2,
 FileText,
 HelpCircle,
 IdCard,
 Landmark,
 Send,
 ShieldCheck,
 Sparkles,
 type LucideIcon,
 UserRoundCheck,
 WalletCards,
} from 'lucide-react';
import { toast } from 'sonner';
import type {
 CreateEmployeeHrServiceRequestPayload,
 EmployeeHrSelfServiceDashboard,
 EmployeeHrServiceRequest,
} from '@/lib/hr/employee-self-service';
import {
 cancelEmployeeHrServiceRequest,
 createEmployeeHrServiceRequest,
} from '@/lib/hr/self-service-api';
import { calculateLeaveDays, formatLeaveType, HR_LEAVE_TYPES } from '@/lib/hr/leave-balances';
import type { HrLeaveType, HrServiceRequestPriority, HrServiceRequestType } from '@/types/database';
import { StaffPayHrPanel } from '@/components/staff/staff-pay-hr-panel';
import { StaffSchedulePanel } from '@/components/shifts/staff-schedule-panel';
import { useLanguage } from '@/components/i18n/language-provider';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
 KpiCard,
 KpiGrid,
 ModuleHeader,
 ModuleLayout,
 PrimaryActionButton,
 SectionCard,
 moduleTabsListClass,
 moduleTabsTriggerClass,
} from '@/components/shared/module-ui';
import { cn } from '@/lib/utils';

type Copy = {
 title: string;
 description: string;
 profile: string;
 requests: string;
 records: string;
 schedule: string;
 payroll: string;
 profileReady: string;
 pending: string;
 attendance: string;
 leaveBalance: string;
 payslips: string;
 localOnly: string;
 overview: string;
 newRequest: string;
 requestHistory: string;
 employerRecords: string;
 recentAttendance: string;
 submit: string;
 submitting: string;
 cancelRequest: string;
 canceling: string;
 titleLabel: string;
 detailsLabel: string;
 priority: string;
 startDate: string;
 endDate: string;
 requestType: string;
 serviceDesk: string;
 serviceDeskDesc: string;
 goProfile: string;
 goSchedule: string;
 goPayroll: string;
 noRequests: string;
 noAttendance: string;
 activeEmployer: string;
 legalEmployer: string;
 operationScope: string;
 bankInfo: string;
 leaveType: string;
 remainingLeave: string;
 leavePending: string;
 branch: string;
 company: string;
 profileMissing: string;
 profileComplete: string;
};

const copy: Record<'ms' | 'en', Copy> = {
 ms: {
 title: 'HRMIS Kendiri Pekerja',
 description:
 'Urus profil perkhidmatan, permohonan HR, jadual, kehadiran, gaji dan slip sendiri mengikut majikan legal sebenar.',
 profile: 'Profil Saya',
 requests: 'Perkhidmatan',
 records: 'Rekod Saya',
 schedule: 'Jadual',
 payroll: 'Gaji & Slip',
 profileReady: 'Profil HR',
 pending: 'Permohonan aktif',
 attendance: 'Rekod kehadiran',
 leaveBalance: 'Baki cuti',
 payslips: 'Slip gaji',
 localOnly:
 'Portal kendiri ini disediakan untuk pekerja tempatan. Jika akaun ini belum dipautkan kepada rekod staf tempatan, HR perlu kemaskini rekod pekerja dahulu.',
 overview: 'Ringkasan HRMIS',
 newRequest: 'Hantar Permohonan HR',
 requestHistory: 'Sejarah Permohonan',
 employerRecords: 'Majikan & Penempatan',
 recentAttendance: 'Kehadiran Terkini',
 submit: 'Hantar permohonan',
 submitting: 'Menghantar...',
 cancelRequest: 'Batalkan',
 canceling: 'Membatalkan...',
 titleLabel: 'Tajuk ringkas',
 detailsLabel: 'Penerangan / sebab',
 priority: 'Keutamaan',
 startDate: 'Tarikh mula',
 endDate: 'Tarikh tamat',
 requestType: 'Jenis urusan',
 serviceDesk: 'Kaunter HR Kendiri',
 serviceDeskDesc:
 'Pilih urusan yang betul supaya HR boleh proses ikut syarikat, cawangan dan rekod staf yang tepat.',
 goProfile: 'Kemaskini profil',
 goSchedule: 'Lihat jadual',
 goPayroll: 'Lihat gaji',
 noRequests: 'Belum ada permohonan HR.',
 noAttendance: 'Belum ada rekod kehadiran untuk dipaparkan.',
 activeEmployer: 'Majikan aktif',
 legalEmployer: 'Majikan legal',
 operationScope: 'Scope operasi',
 bankInfo: 'Bank payroll',
 leaveType: 'Jenis cuti',
 remainingLeave: 'Baki semasa',
 leavePending: 'Dalam permohonan',
 branch: 'Cawangan',
 company: 'Syarikat',
 profileMissing: 'Perlu lengkap',
 profileComplete: 'Lengkap',
 },
 en: {
 title: 'Employee HRMIS Self-Service',
 description:
 'Manage your service profile, HR requests, schedule, attendance, payroll and payslips by the correct legal employer.',
 profile: 'My Profile',
 requests: 'Services',
 records: 'My Records',
 schedule: 'Schedule',
 payroll: 'Payroll & Payslips',
 profileReady: 'HR Profile',
 pending: 'Active requests',
 attendance: 'Attendance records',
 leaveBalance: 'Leave balance',
 payslips: 'Payslips',
 localOnly:
 'This self-service portal is prepared for local employees. If this account is not linked to a local staff record yet, HR needs to update the employee record first.',
 overview: 'HRMIS Summary',
 newRequest: 'Submit HR Request',
 requestHistory: 'Request History',
 employerRecords: 'Employer & Placement',
 recentAttendance: 'Recent Attendance',
 submit: 'Submit request',
 submitting: 'Submitting...',
 cancelRequest: 'Cancel',
 canceling: 'Cancelling...',
 titleLabel: 'Short title',
 detailsLabel: 'Details / reason',
 priority: 'Priority',
 startDate: 'Start date',
 endDate: 'End date',
 requestType: 'Service type',
 serviceDesk: 'HR Self-Service Desk',
 serviceDeskDesc:
 'Choose the correct service so HR can process it by company, branch and staff record.',
 goProfile: 'Update profile',
 goSchedule: 'View schedule',
 goPayroll: 'View payroll',
 noRequests: 'No HR requests yet.',
 noAttendance: 'No attendance records to show yet.',
 activeEmployer: 'Active employer',
 legalEmployer: 'Legal employer',
 operationScope: 'Operating scope',
 bankInfo: 'Payroll bank',
 leaveType: 'Leave type',
 remainingLeave: 'Current balance',
 leavePending: 'Pending request',
 branch: 'Branch',
 company: 'Company',
 profileMissing: 'Incomplete',
 profileComplete: 'Complete',
 },
};

type RequestOption = {
 value: HrServiceRequestType;
 labelMs: string;
 labelEn: string;
 descMs: string;
 descEn: string;
 groupMs: string;
 groupEn: string;
};

const requestOptions: RequestOption[] = [
 {
 value: 'LEAVE',
 labelMs: 'Cuti / pelepasan kerja',
 labelEn: 'Leave / time-off',
 descMs: 'Mohon cuti tahunan, kecemasan, sakit atau pelepasan kerja.',
 descEn: 'Apply for annual leave, emergency leave, sick leave or time-off.',
 groupMs: 'Cuti & Kehadiran',
 groupEn: 'Leave & Attendance',
 },
 {
 value: 'ATTENDANCE',
 labelMs: 'Kehadiran / waktu kerja',
 labelEn: 'Attendance / work hours',
 descMs: 'Semak clock-in, clock-out, terlupa punch, rehat atau jam kerja.',
 descEn: 'Review clock-in, clock-out, missed punch, break or work hours.',
 groupMs: 'Cuti & Kehadiran',
 groupEn: 'Leave & Attendance',
 },
 {
 value: 'OVERTIME',
 labelMs: 'OT / kerja lebih masa',
 labelEn: 'Overtime / extra hours',
 descMs: 'Mohon atau semak kerja lebih masa yang perlu masuk payroll.',
 descEn: 'Request or review overtime that should flow into payroll.',
 groupMs: 'Cuti & Kehadiran',
 groupEn: 'Leave & Attendance',
 },
 {
 value: 'PROFILE_UPDATE',
 labelMs: 'Kemaskini profil HR',
 labelEn: 'HR profile update',
 descMs: 'Kemaskini alamat, telefon, waris, bank, IC atau data pekerja.',
 descEn: 'Update address, phone, emergency contact, bank, ID or staff data.',
 groupMs: 'Profil & Dokumen',
 groupEn: 'Profile & Documents',
 },
 {
 value: 'DOCUMENT',
 labelMs: 'Dokumen / surat HR',
 labelEn: 'HR document / letter',
 descMs: 'Minta surat pengesahan kerja, dokumen rasmi atau salinan rekod.',
 descEn: 'Request employment letters, official documents or record copies.',
 groupMs: 'Profil & Dokumen',
 groupEn: 'Profile & Documents',
 },
 {
 value: 'PAYROLL',
 labelMs: 'Gaji / elaun / slip',
 labelEn: 'Payroll / allowance / payslip',
 descMs: 'Semak gaji, elaun, potongan, komisyen, slip atau bayaran.',
 descEn: 'Review salary, allowance, deduction, commission, payslip or payment.',
 groupMs: 'Gaji & Tuntutan',
 groupEn: 'Payroll & Claims',
 },
 {
 value: 'CLAIM',
 labelMs: 'Tuntutan / claim',
 labelEn: 'Claim / reimbursement',
 descMs: 'Hantar tuntutan kos kerja, perjalanan, pembelian atau bayaran balik.',
 descEn: 'Submit work cost, travel, purchase or reimbursement claims.',
 groupMs: 'Gaji & Tuntutan',
 groupEn: 'Payroll & Claims',
 },
 {
 value: 'LOAN_ADVANCE',
 labelMs: 'Advance / pinjaman gaji',
 labelEn: 'Advance / salary loan',
 descMs: 'Mohon advance gaji atau pinjaman pekerja untuk semakan HR.',
 descEn: 'Request salary advance or employee loan for HR review.',
 groupMs: 'Gaji & Tuntutan',
 groupEn: 'Payroll & Claims',
 },
 {
 value: 'TRANSFER',
 labelMs: 'Pertukaran tempat kerja',
 labelEn: 'Workplace transfer',
 descMs: 'Mohon tukar cawangan, kawasan, syif, jabatan atau syarikat.',
 descEn: 'Request branch, area, shift, department or company transfer.',
 groupMs: 'Penempatan & Aset',
 groupEn: 'Placement & Assets',
 },
 {
 value: 'UNIFORM_EQUIPMENT',
 labelMs: 'Uniform / peralatan',
 labelEn: 'Uniform / equipment',
 descMs: 'Mohon uniform, tag nama, peralatan kerja atau kelengkapan asas.',
 descEn: 'Request uniform, name tag, work tools or basic equipment.',
 groupMs: 'Penempatan & Aset',
 groupEn: 'Placement & Assets',
 },
 {
 value: 'ASSET',
 labelMs: 'Aset syarikat',
 labelEn: 'Company asset',
 descMs: 'Lapor penerimaan, kerosakan, pulangan atau kehilangan aset syarikat.',
 descEn: 'Report received, damaged, returned or missing company assets.',
 groupMs: 'Penempatan & Aset',
 groupEn: 'Placement & Assets',
 },
 {
 value: 'TRAINING',
 labelMs: 'Latihan / kursus',
 labelEn: 'Training / course',
 descMs: 'Mohon latihan SOP, keselamatan, pengurusan atau kemahiran kerja.',
 descEn: 'Request SOP, safety, management or work skill training.',
 groupMs: 'Pembangunan & Kes',
 groupEn: 'Development & Cases',
 },
 {
 value: 'DISCIPLINE',
 labelMs: 'Disiplin / kaunseling',
 labelEn: 'Discipline / counselling',
 descMs: 'Minta semakan, kaunseling, penjelasan kes atau rekod disiplin.',
 descEn: 'Request review, counselling, case explanation or discipline record.',
 groupMs: 'Pembangunan & Kes',
 groupEn: 'Development & Cases',
 },
 {
 value: 'RESIGNATION',
 labelMs: 'Berhenti kerja / tamat servis',
 labelEn: 'Resignation / end of service',
 descMs: 'Hantar notis berhenti kerja, serahan tugas atau tamat perkhidmatan.',
 descEn: 'Submit resignation notice, handover or end-of-service request.',
 groupMs: 'Pembangunan & Kes',
 groupEn: 'Development & Cases',
 },
 {
 value: 'HR_HELP',
 labelMs: 'Bantuan HR lain',
 labelEn: 'Other HR help',
 descMs: 'Gunakan jika urusan tidak termasuk dalam kategori di atas.',
 descEn: 'Use this when the request does not fit the categories above.',
 groupMs: 'Pembangunan & Kes',
 groupEn: 'Development & Cases',
 },
];

const priorityOptions: Array<{ value: HrServiceRequestPriority; labelMs: string; labelEn: string }> = [
 { value: 'LOW', labelMs: 'Rendah', labelEn: 'Low' },
 { value: 'NORMAL', labelMs: 'Biasa', labelEn: 'Normal' },
 { value: 'HIGH', labelMs: 'Segera', labelEn: 'High' },
];

function fmtDate(value: string | null | undefined) {
 if (!value) return '-';
 return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 });
}

function fmtDateTime(value: string | null | undefined) {
 if (!value) return '-';
 return new Date(value).toLocaleString('ms-MY', {
 day: '2-digit',
 month: 'short',
 hour: '2-digit',
 minute: '2-digit',
 });
}

function statusBadge(status: EmployeeHrServiceRequest['status']) {
 if (status === 'APPROVED' || status === 'COMPLETED') {
 return 'border-emerald-200 bg-emerald-50 text-emerald-800';
 }
 if (status === 'REJECTED' || status === 'CANCELLED') {
 return 'border-red-200 bg-red-50 text-red-700';
 }
 if (status === 'IN_REVIEW') return 'border-sky-200 bg-sky-50 text-sky-800';
 return 'border-amber-200 bg-amber-50 text-amber-900';
}

function statusLabel(status: EmployeeHrServiceRequest['status'], lang: 'ms' | 'en') {
 const labels: Record<'ms' | 'en', Record<EmployeeHrServiceRequest['status'], string>> = {
 ms: {
 SUBMITTED: 'Dihantar',
 IN_REVIEW: 'Sedang disemak',
 APPROVED: 'Diluluskan',
 REJECTED: 'Ditolak',
 CANCELLED: 'Dibatalkan',
 COMPLETED: 'Selesai',
 },
 en: {
 SUBMITTED: 'Submitted',
 IN_REVIEW: 'In review',
 APPROVED: 'Approved',
 REJECTED: 'Rejected',
 CANCELLED: 'Cancelled',
 COMPLETED: 'Completed',
 },
 };
 return labels[lang][status] ?? status.replace('_', ' ');
}

function statusStep(status: EmployeeHrServiceRequest['status']) {
 const map: Record<EmployeeHrServiceRequest['status'], number> = {
 SUBMITTED: 1,
 IN_REVIEW: 2,
 APPROVED: 3,
 COMPLETED: 4,
 REJECTED: 4,
 CANCELLED: 4,
 };
 return map[status] ?? 1;
}

function requestOptionLabel(option: RequestOption, lang: 'ms' | 'en') {
 return lang === 'en' ? option.labelEn : option.labelMs;
}

function requestOptionDescription(option: RequestOption, lang: 'ms' | 'en') {
 return lang === 'en' ? option.descEn : option.descMs;
}

function requestOptionGroup(option: RequestOption, lang: 'ms' | 'en') {
 return lang === 'en' ? option.groupEn : option.groupMs;
}

function EmployeeHrCommandCenter({
 data,
 pendingCount,
 lang,
 copyText,
}: {
 data: EmployeeHrSelfServiceDashboard;
 pendingCount: number;
 lang: 'ms' | 'en';
 copyText: Copy;
}) {
 const profileComplete = data.profile.completion_percent >= 90;
 const employer = data.primary_staff;
 const nextAction = !profileComplete
 ? {
 icon: IdCard,
 title: lang === 'en' ? 'Complete HR profile' : 'Lengkapkan profil HR',
 desc:
 lang === 'en'
 ? 'Update contact, bank and emergency details before HR processing.'
 : 'Kemaskini contact, bank dan waris supaya urusan HR tidak tergantung.',
 href: '/profile',
 }
 : pendingCount > 0
 ? {
 icon: FileCheck2,
 title: lang === 'en' ? 'Track active request' : 'Pantau permohonan aktif',
 desc:
 lang === 'en'
 ? 'Review current HR request status and HR notes.'
 : 'Semak status permohonan semasa dan nota daripada HR.',
 href: '/hr',
 }
 : {
 icon: Send,
 title: lang === 'en' ? 'Submit a new HR request' : 'Hantar urusan HR baharu',
 desc:
 lang === 'en'
 ? 'Use the service catalogue for leave, documents, claims or payroll help.'
 : 'Guna katalog servis untuk cuti, dokumen, claim atau bantuan gaji.',
 href: '/hr',
 };
 const NextIcon = nextAction.icon;

 return (
 <SectionCard className="border-amber-200 bg-gradient-to-br from-white via-amber-50/50 to-emerald-50/40">
 <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
 <div className="space-y-4">
 <div className="flex items-start gap-3">
 <div className="rounded-xl border border-amber-200 bg-white p-3 text-amber-700 shadow-sm">
 <Sparkles className="h-6 w-6" />
 </div>
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-700">
 {lang === 'en' ? 'HRMIS work passport' : 'Pas kerja HRMIS'}
 </p>
 <h2 className="mt-1 text-2xl font-semibold tracking-tight text-stone-950">
 {data.profile.full_name}
 </h2>
 <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
 {lang === 'en'
 ? 'One place for your employment record, schedule, attendance, payroll and HR requests.'
 : 'Satu tempat untuk rekod kerja, jadual, kehadiran, gaji dan semua urusan HR pekerja.'}
 </p>
 </div>
 </div>

 <div className="grid gap-3 sm:grid-cols-3">
 <div className="rounded-xl border bg-white/85 p-3 shadow-sm">
 <p className="text-xs font-medium text-muted-foreground">{copyText.profileReady}</p>
 <p className="mt-1 text-2xl font-semibold text-stone-950">{data.profile.completion_percent}%</p>
 <div className="mt-2 h-1.5 rounded-full bg-stone-100">
 <div
 className={cn('h-full rounded-full', profileComplete ? 'bg-emerald-500' : 'bg-amber-500')}
 style={{ width: `${data.profile.completion_percent}%` }}
 />
 </div>
 </div>
 <div className="rounded-xl border bg-white/85 p-3 shadow-sm">
 <p className="text-xs font-medium text-muted-foreground">{copyText.legalEmployer}</p>
 <p className="mt-1 line-clamp-1 text-sm font-semibold text-stone-950">
 {employer?.legal_entity_name ?? employer?.legal_entity_code ?? '-'}
 </p>
 <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
 {[employer?.legal_entity_code, employer?.branch_code].filter(Boolean).join(' - ') || 'HQ / Syarikat'}
 </p>
 </div>
 <div className="rounded-xl border bg-white/85 p-3 shadow-sm">
 <p className="text-xs font-medium text-muted-foreground">{copyText.pending}</p>
 <p className="mt-1 text-2xl font-semibold text-stone-950">{pendingCount}</p>
 <p className="mt-1 text-xs text-muted-foreground">
 {lang === 'en' ? 'Needs HR follow-up' : 'Untuk tindakan HR'}
 </p>
 </div>
 </div>
 </div>

 <Link
 href={nextAction.href}
 className="flex min-h-[190px] flex-col justify-between rounded-2xl border border-amber-200 bg-stone-950 p-5 text-white shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl"
 >
 <div>
 <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-400 text-stone-950">
 <NextIcon className="h-5 w-5" />
 </div>
 <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-200">
 {lang === 'en' ? 'Recommended next step' : 'Cadangan tindakan'}
 </p>
 <h3 className="mt-2 text-xl font-semibold">{nextAction.title}</h3>
 <p className="mt-2 text-sm text-stone-300">{nextAction.desc}</p>
 </div>
 <div className="mt-5 flex items-center justify-between text-sm font-semibold text-amber-200">
 <span>{lang === 'en' ? 'Open now' : 'Buka sekarang'}</span>
 <CheckCircle2 className="h-4 w-4" />
 </div>
 </Link>
 </div>
 </SectionCard>
 );
}

function ServiceTile({
 icon: Icon,
 title,
 description,
 href,
}: {
 icon: LucideIcon;
 title: string;
 description: string;
 href: string;
}) {
 return (
 <Link
 href={href}
 className="group rounded-lg border bg-white p-4 transition hover:-translate-y-0.5 hover:border-amber-300 hover:shadow-md"
 >
 <div className="flex items-start gap-3">
 <div className="rounded-lg border bg-amber-50 p-2 text-amber-700">
 <Icon className="h-5 w-5" />
 </div>
 <div>
 <p className="font-semibold text-stone-950">{title}</p>
 <p className="mt-1 text-sm text-muted-foreground">{description}</p>
 </div>
 </div>
 </Link>
 );
}

function LeaveBalancePanel({
 balances,
 lang,
 copyText,
}: {
 balances: EmployeeHrSelfServiceDashboard['leave_balances'];
 lang: 'ms' | 'en';
 copyText: Copy;
}) {
 const currentYear = new Date().getFullYear();
 const current = balances.filter((balance) => balance.leave_year === currentYear);
 const rows = HR_LEAVE_TYPES.map((type) => {
 const balance = current.find((row) => row.leave_type === type) ?? balances.find((row) => row.leave_type === type) ?? null;
 return { type, balance };
 });

 return (
 <SectionCard
 title={lang === 'en' ? 'My Leave Balance' : 'Baki Cuti Saya'}
 description={
 lang === 'en'
 ? 'This is the official HR balance for local employees. Pending leave is held until HR approval.'
 : 'Ini baki rasmi HR untuk pekerja tempatan. Cuti dalam permohonan akan ditahan sehingga HR luluskan.'
 }
 >
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
 {rows.map(({ type, balance }) => {
 const remaining = Number(balance?.remaining ?? 0);
 const pending = Number(balance?.pending_days ?? 0);
 const low = type !== 'UNPAID' && remaining <= 2;
 return (
 <div
 key={type}
 className={cn(
 'rounded-xl border p-4 shadow-sm',
 balance
 ? low
 ? 'border-amber-200 bg-amber-50/70'
 : 'border-emerald-200 bg-emerald-50/70'
 : 'border-dashed bg-muted/20',
 )}
 >
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
 {formatLeaveType(type, lang)}
 </p>
 <p className="mt-2 text-2xl font-semibold text-stone-950">
 {balance ? `${remaining.toFixed(1)} ${lang === 'en' ? 'days' : 'hari'}` : '-'}
 </p>
 <div className="mt-3 space-y-1 text-xs text-muted-foreground">
 <p>{copyText.leavePending}: {pending.toFixed(1)}</p>
 <p>{lang === 'en' ? 'Entitlement' : 'Kelayakan'}: {Number(balance?.entitlement_days ?? 0).toFixed(1)}</p>
 <p>{lang === 'en' ? 'Used' : 'Diguna'}: {Number(balance?.used_days ?? 0).toFixed(1)}</p>
 </div>
 </div>
 );
 })}
 </div>
 <div className="mt-4 rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-sky-950">
 <div className="flex gap-2">
 <HelpCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <p>
 {lang === 'en'
 ? 'For leave, attendance mistakes, missed punch, salary questions or other problems, open the Services tab and submit the correct HR request.'
 : 'Untuk cuti, masalah kehadiran, terlupa punch, semakan gaji atau apa-apa isu pekerja, buka tab Perkhidmatan dan hantar permohonan HR yang betul.'}
 </p>
 </div>
 </div>
 </SectionCard>
 );
}

export function EmployeeHrmisDashboard({ data }: { data: EmployeeHrSelfServiceDashboard }) {
 const { locale } = useLanguage();
 const lang = locale === 'en' ? 'en' : 'ms';
 const t = copy[lang];
 const [requests, setRequests] = useState<EmployeeHrServiceRequest[]>(data.service_requests);
 const [requestType, setRequestType] = useState<HrServiceRequestType>('LEAVE');
 const [leaveType, setLeaveType] = useState<HrLeaveType>('ANNUAL');
 const [priority, setPriority] = useState<HrServiceRequestPriority>('NORMAL');
 const [title, setTitle] = useState('');
 const [description, setDescription] = useState('');
 const [startDate, setStartDate] = useState('');
 const [endDate, setEndDate] = useState('');
 const [submitting, setSubmitting] = useState(false);
 const [cancelingId, setCancelingId] = useState<string | null>(null);

 const latestRequests = requests.slice(0, 6);
 const pendingCount = requests.filter((row) => ['SUBMITTED', 'IN_REVIEW'].includes(row.status)).length;
 const currentYear = new Date().getFullYear();
 const currentLeaveBalances = data.leave_balances.filter((balance) => balance.leave_year === currentYear);
 const annualLeave = currentLeaveBalances.find((balance) => balance.leave_type === 'ANNUAL') ?? data.leave_balances.find((balance) => balance.leave_type === 'ANNUAL') ?? null;
 const selectedLeaveBalance =
 currentLeaveBalances.find((balance) => balance.leave_type === leaveType) ??
 data.leave_balances.find((balance) => balance.leave_type === leaveType) ??
 null;
 const requestedLeaveDays = requestType === 'LEAVE'
 ? calculateLeaveDays(startDate || null, endDate || null)
 : 0;
 const leaveRemaining = Number(selectedLeaveBalance?.remaining ?? 0);
 const leaveBalanceWarning =
 requestType === 'LEAVE' &&
 leaveType !== 'UNPAID' &&
 Boolean(startDate) &&
 requestedLeaveDays > leaveRemaining;
 const selectedRequestOption = useMemo(
 () => requestOptions.find((row) => row.value === requestType) ?? requestOptions[0],
 [requestType],
 );
 const requestLabel = requestOptionLabel(selectedRequestOption, lang);
 const requestDescription = requestOptionDescription(selectedRequestOption, lang);
 const groupedRequestOptions = useMemo(() => {
 const groups = new Map<string, RequestOption[]>();
 for (const option of requestOptions) {
 const group = requestOptionGroup(option, lang);
 groups.set(group, [...(groups.get(group) ?? []), option]);
 }
 return [...groups.entries()].map(([group, options]) => ({ group, options }));
 }, [lang]);

 async function handleSubmit() {
 if (leaveBalanceWarning) {
 toast.error(
 lang === 'en'
 ? `Leave balance is not enough. Requested ${requestedLeaveDays} day(s), remaining ${leaveRemaining.toFixed(1)}.`
 : `Baki cuti tidak mencukupi. Mohon ${requestedLeaveDays} hari, baki ${leaveRemaining.toFixed(1)} hari.`,
 );
 return;
 }

 const payload: CreateEmployeeHrServiceRequestPayload = {
 request_type: requestType,
 priority,
 title,
 description,
 start_date: startDate || null,
 end_date: endDate || null,
 ...(requestType === 'LEAVE' ? { leave_type: leaveType } : {}),
 };
 setSubmitting(true);
 try {
 const result = await createEmployeeHrServiceRequest(payload);
 const request = {
 ...result.request,
 legal_entity_code: result.request.legal_entity_code ?? data.primary_staff?.legal_entity_code ?? null,
 legal_entity_name: result.request.legal_entity_name ?? data.primary_staff?.legal_entity_name ?? null,
 branch_code: result.request.branch_code ?? data.primary_staff?.branch_code ?? null,
 branch_name: result.request.branch_name ?? data.primary_staff?.branch_name ?? null,
 };
 setRequests((current) => [request, ...current]);
 setTitle('');
 setDescription('');
 setStartDate('');
 setEndDate('');
 setLeaveType('ANNUAL');
 toast.success(lang === 'en' ? 'HR request submitted.' : 'Permohonan HR telah dihantar.');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal menghantar permohonan HR.');
 } finally {
 setSubmitting(false);
 }
 }

 async function handleCancelRequest(requestId: string) {
 setCancelingId(requestId);
 try {
 const result = await cancelEmployeeHrServiceRequest(requestId);
 setRequests((current) =>
 current.map((request) =>
 request.id === requestId
 ? {
 ...request,
 ...result.request,
 legal_entity_code: request.legal_entity_code,
 legal_entity_name: request.legal_entity_name,
 branch_code: request.branch_code,
 branch_name: request.branch_name,
 }
 : request));
 toast.success(lang === 'en' ? 'HR request cancelled.' : 'Permohonan HR telah dibatalkan.');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal batalkan permohonan HR.');
 } finally {
 setCancelingId(null);
 }
 }

 return (
 <ModuleLayout>
 <ModuleHeader
 title={t.title}
 description={t.description}
 icon={ShieldCheck}
 badges={
 <>
 <Badge variant={data.is_local_employee ? 'default' : 'destructive'}>
 {data.is_local_employee ? 'Pekerja Tempatan' : 'Semak rekod staf'}
 </Badge>
 {data.primary_staff?.legal_entity_code && (
 <Badge variant="outline">
 {lang === 'en' ? 'Employer' : 'Majikan'}: {data.primary_staff.legal_entity_code}
 </Badge>)}
 {data.primary_staff?.staff_code && (
 <Badge variant="secondary">{data.primary_staff.staff_code}</Badge>)}
 </>
 }
 actions={
 <Link href="/profile" className={cn(buttonVariants({ variant: 'outline' }), 'gap-2')}>
 <IdCard className="h-4 w-4" />
 {t.profile}
 </Link>
 }
 />

 {!data.is_local_employee && (
 <SectionCard className="border-amber-300 bg-amber-50/50">
 <div className="flex gap-3 text-sm text-amber-950">
 <HelpCircle className="mt-0.5 h-5 w-5 shrink-0" />
 <p>{t.localOnly}</p>
 </div>
 </SectionCard>
 )}

 <EmployeeHrCommandCenter data={data} pendingCount={pendingCount} lang={lang} copyText={t} />

 <KpiGrid cols={5}>
 <KpiCard
 title={t.profileReady}
 value={`${data.profile.completion_percent}%`}
 description={data.profile.missing_fields.length ? t.profileMissing : t.profileComplete}
 icon={UserRoundCheck}
 variant={data.profile.completion_percent >= 90 ? 'success' : 'warning'}
 />
 <KpiCard
 title={t.pending}
 value={pendingCount}
 description={t.serviceDesk}
 icon={FileCheck2}
 variant={requests.some((row) => ['SUBMITTED', 'IN_REVIEW'].includes(row.status)) ? 'warning' : 'success'}
 />
 <KpiCard
 title={t.attendance}
 value={data.summary.attendance_records}
 description={data.primary_staff?.branch_code ?? t.branch}
 icon={Clock3}
 />
 <KpiCard
 title={t.leaveBalance}
 value={annualLeave ? `${Number(annualLeave.remaining).toFixed(1)} ${lang === 'en' ? 'days' : 'hari'}` : '-'}
 description={annualLeave ? `${t.leavePending}: ${Number(annualLeave.pending_days).toFixed(1)}` : t.employerRecords}
 icon={CalendarClock}
 variant={annualLeave && annualLeave.remaining <= 2 ? 'warning' : 'success'}
 />
 <KpiCard
 title={t.payslips}
 value={data.summary.active_employers}
 description={t.activeEmployer}
 icon={WalletCards}
 />
 </KpiGrid>

 <Tabs defaultValue="overview" className="space-y-4">
 <TabsList className={moduleTabsListClass}>
 <TabsTrigger value="overview" className={moduleTabsTriggerClass}>
 <BriefcaseBusiness className="h-4 w-4" /> {t.overview}
 </TabsTrigger>
 <TabsTrigger value="requests" className={moduleTabsTriggerClass}>
 <FileText className="h-4 w-4" /> {t.requests}
 </TabsTrigger>
 <TabsTrigger value="records" className={moduleTabsTriggerClass}>
 <IdCard className="h-4 w-4" /> {t.records}
 </TabsTrigger>
 <TabsTrigger value="schedule" className={moduleTabsTriggerClass}>
 <CalendarClock className="h-4 w-4" /> {t.schedule}
 </TabsTrigger>
 <TabsTrigger value="payroll" className={moduleTabsTriggerClass}>
 <Landmark className="h-4 w-4" /> {t.payroll}
 </TabsTrigger>
 </TabsList>

 <TabsContent value="overview" className="space-y-4">
 <LeaveBalancePanel balances={data.leave_balances} lang={lang} copyText={t} />

 <SectionCard title={t.serviceDesk} description={t.serviceDeskDesc}>
 <div className="grid gap-3 md:grid-cols-3">
 <ServiceTile
 icon={IdCard}
 title={t.goProfile}
 description={
 lang === 'en'
 ? 'Update phone, IC, address, emergency contact and bank reference.'
 : 'Kemaskini telefon, IC, alamat, hubungan kecemasan dan rujukan bank.'
 }
 href="/profile"
 />
 <ServiceTile
 icon={CalendarClock}
 title={t.goSchedule}
 description={
 lang === 'en'
 ? 'Check this week and next week schedule before work starts.'
 : 'Semak jadual minggu ini dan minggu depan sebelum mula kerja.'
 }
 href="/shifts"
 />
 <ServiceTile
 icon={WalletCards}
 title={t.goPayroll}
 description={
 lang === 'en'
 ? 'Review payroll, payslips and payment history in one place.'
 : 'Semak gaji, slip dan sejarah bayaran di satu tempat.'
 }
 href="/hr"
 />
 </div>
 </SectionCard>

 <SectionCard
 title={lang === 'en' ? 'HRMIS Flow' : 'Aliran HRMIS Pekerja'}
 description={
 lang === 'en'
 ? 'Follow the same order every time so HR records, payroll and approvals stay clean.'
 : 'Ikut turutan ini setiap kali supaya rekod HR, payroll dan kelulusan sentiasa kemas.'
 }
 >
 <div className="grid gap-3 md:grid-cols-4">
 {[
 {
 icon: IdCard,
 title: lang === 'en' ? 'Profile' : 'Profil',
 desc: lang === 'en' ? 'Keep personal and bank data current.' : 'Pastikan data diri dan bank sentiasa tepat.',
 tone: 'bg-sky-50 text-sky-700 border-sky-100',
 },
 {
 icon: CalendarClock,
 title: lang === 'en' ? 'Schedule' : 'Jadual',
 desc: lang === 'en' ? 'Check shift, leave and attendance.' : 'Semak syif, cuti dan kehadiran.',
 tone: 'bg-emerald-50 text-emerald-700 border-emerald-100',
 },
 {
 icon: ClipboardList,
 title: lang === 'en' ? 'Request' : 'Permohonan',
 desc: lang === 'en' ? 'Submit HR matters with clear details.' : 'Hantar urusan HR dengan maklumat lengkap.',
 tone: 'bg-amber-50 text-amber-700 border-amber-100',
 },
 {
 icon: Banknote,
 title: lang === 'en' ? 'Payroll' : 'Gaji',
 desc: lang === 'en' ? 'Review payslip, claims and deductions.' : 'Semak slip, claim dan potongan gaji.',
 tone: 'bg-violet-50 text-violet-700 border-violet-100',
 },
 ].map((step, index) => (
 <div key={step.title} className="rounded-xl border bg-white p-4 shadow-sm">
 <div className="flex items-center justify-between gap-3">
 <div className={cn('rounded-lg border p-2', step.tone)}>
 <step.icon className="h-5 w-5" />
 </div>
 <span className="text-xs font-semibold text-muted-foreground">{index + 1}</span>
 </div>
 <p className="mt-3 font-semibold text-stone-950">{step.title}</p>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{step.desc}</p>
 </div>
 ))}
 </div>
 </SectionCard>

 <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
 <SectionCard title={t.requestHistory}>
 <RequestList requests={latestRequests} emptyText={t.noRequests} lang={lang} />
 </SectionCard>
 <SectionCard title={t.employerRecords}>
 <div className="space-y-3">
 {data.staff_records.map((staff) => (
 <div key={staff.staff_id} className="rounded-xl border bg-white px-4 py-3 text-sm shadow-sm">
 <div className="flex flex-wrap items-center justify-between gap-2">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.legalEmployer}</p>
 <p className="font-semibold">{staff.legal_entity_name ?? staff.legal_entity_code ?? t.company}</p>
 </div>
 <Badge variant={staff.worker_type === 'LOCAL' ? 'default' : 'outline'}>
 {staff.worker_type === 'LOCAL' ? 'Local' : staff.worker_type ?? 'Staff'}
 </Badge>
 </div>
 <p className="mt-1 text-muted-foreground">
 {staff.staff_code} - {staff.branch_code ? `${staff.branch_code} ${staff.branch_name ?? ''}` : 'HQ / Syarikat'}
 </p>
 <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
 <span className="inline-flex items-center gap-1.5">
 <Building2 className="h-3.5 w-3.5" />
 {staff.region_name ?? staff.legal_entity_scope ?? t.operationScope}
 </span>
 <span className="inline-flex items-center gap-1.5">
 <WalletCards className="h-3.5 w-3.5" />
 {staff.bank_name ?? (lang === 'en' ? 'Payroll bank not set' : 'Bank payroll belum ditetapkan')}
 </span>
 </div>
 </div>))}
 </div>
 </SectionCard>
 </div>
 </TabsContent>

 <TabsContent value="requests" className="space-y-4">
 <SectionCard
 title={lang === 'en' ? 'HRMIS Service Catalogue' : 'Katalog Perkhidmatan HRMIS'}
 description={
 lang === 'en'
 ? 'Choose the exact HR service first. The system routes it to HR by company, branch and employee record.'
 : 'Pilih urusan HR yang tepat dahulu. Sistem akan salurkan kepada HR mengikut syarikat, cawangan dan rekod pekerja.'
 }
 >
 <div className="grid gap-4 lg:grid-cols-2">
 {groupedRequestOptions.map(({ group, options }) => (
 <div key={group} className="rounded-xl border bg-white/80 p-3">
 <div className="mb-3 flex items-center justify-between gap-2">
 <p className="font-semibold text-stone-950">{group}</p>
 <Badge variant="secondary">{options.length}</Badge>
 </div>
 <div className="grid gap-2">
 {options.map((option) => {
 const active = option.value === requestType;
 return (
 <button
 key={option.value}
 type="button"
 onClick={() => setRequestType(option.value)}
 className={cn(
 'rounded-lg border px-3 py-2 text-left text-sm transition hover:-translate-y-0.5 hover:border-amber-300 hover:bg-amber-50/60',
 active ? 'border-amber-400 bg-amber-50 shadow-sm' : 'bg-background',
 )}
 >
 <div className="flex items-start justify-between gap-3">
 <span className="font-semibold text-stone-950">{requestOptionLabel(option, lang)}</span>
 {active && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
 </div>
 <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
 {requestOptionDescription(option, lang)}
 </p>
 </button>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </SectionCard>

 <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
 <SectionCard title={t.newRequest} description={`${t.requestType}: ${requestLabel ?? '-'}`}>
 <div className="space-y-4">
 <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-sm text-sky-950">
 <div className="flex items-start gap-2">
 <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
 <p>
 {lang === 'en'
 ? 'Write clear details and attach dates where relevant. HR will route this by your legal employer and branch.'
 : 'Isi maklumat dengan jelas dan pilih tarikh jika berkaitan. HR akan proses ikut majikan legal dan cawangan anda.'}
 </p>
 </div>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-2">
 <Label>{t.requestType}</Label>
 <Select value={requestType} onValueChange={(v) => setRequestType((v ?? 'HR_HELP') as HrServiceRequestType)}>
 <SelectTrigger className="h-10 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {requestOptions.map((option) => (
 <SelectItem key={option.value} value={option.value}>
 {requestOptionLabel(option, lang)}
 </SelectItem>))}
 </SelectContent>
 </Select>
 <p className="text-xs leading-relaxed text-muted-foreground">{requestDescription}</p>
 </div>
 <div className="space-y-2">
 <Label>{t.priority}</Label>
 <Select value={priority} onValueChange={(v) => setPriority((v ?? 'NORMAL') as HrServiceRequestPriority)}>
 <SelectTrigger className="h-10 w-full">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {priorityOptions.map((option) => (
 <SelectItem key={option.value} value={option.value}>
 {lang === 'en' ? option.labelEn : option.labelMs}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <div className="space-y-2">
 <Label>{t.titleLabel}</Label>
 <Input
 value={title}
 onChange={(event) => setTitle(event.target.value)}
 placeholder={lang === 'en' ? 'Example: Need employment confirmation letter' : 'Contoh: Mohon surat pengesahan kerja'}
 />
 </div>

 <div className="grid gap-3 sm:grid-cols-2">
 <div className="space-y-2">
 <Label>{t.startDate}</Label>
 <Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
 </div>
 <div className="space-y-2">
 <Label>{t.endDate}</Label>
 <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
 </div>
 </div>

 {requestType === 'LEAVE' && (
 <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
 <div className="grid gap-3 sm:grid-cols-[0.9fr_1.1fr] sm:items-end">
 <div className="space-y-2">
 <Label>{t.leaveType}</Label>
 <Select value={leaveType} onValueChange={(v) => setLeaveType((v ?? 'ANNUAL') as HrLeaveType)}>
 <SelectTrigger className="h-10 w-full bg-white">
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {HR_LEAVE_TYPES.map((type) => (
 <SelectItem key={type} value={type}>
 {formatLeaveType(type, lang)}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="rounded-lg border bg-white px-3 py-2 text-sm">
 <div className="flex items-center justify-between gap-3">
 <span className="text-muted-foreground">{t.remainingLeave}</span>
 <span className="font-semibold text-stone-950">
 {selectedLeaveBalance
 ? `${Number(selectedLeaveBalance.remaining).toFixed(1)} ${lang === 'en' ? 'days' : 'hari'}`
 : '-'}
 </span>
 </div>
 <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
 <span>{t.leavePending}</span>
 <span>{Number(selectedLeaveBalance?.pending_days ?? 0).toFixed(1)}</span>
 </div>
 </div>
 </div>
 <p className="mt-2 text-xs leading-relaxed text-emerald-900">
 {lang === 'en'
 ? 'HR will hold this leave as pending first. It becomes official only after HR approval.'
 : 'HR akan tahan cuti ini sebagai permohonan dahulu. Ia menjadi rasmi hanya selepas HR meluluskan.'}
 </p>
 {startDate && (
 <p className={cn(
 'mt-2 rounded-lg border px-3 py-2 text-xs font-medium',
 leaveBalanceWarning
 ? 'border-red-200 bg-red-50 text-red-800'
 : 'border-emerald-200 bg-white/70 text-emerald-900',
 )}>
 {lang === 'en'
 ? `Requested: ${requestedLeaveDays} day(s). Remaining: ${leaveRemaining.toFixed(1)} day(s).`
 : `Dimohon: ${requestedLeaveDays} hari. Baki: ${leaveRemaining.toFixed(1)} hari.`}
 </p>)}
 </div>
 )}

 <div className="space-y-2">
 <Label>{t.detailsLabel}</Label>
 <Textarea
 value={description}
 onChange={(event) => setDescription(event.target.value)}
 rows={5}
 placeholder={
 lang === 'en'
 ? 'Write the details HR needs to review your request.'
 : 'Tulis maklumat yang HR perlukan untuk semak permohonan ini.'
 }
 />
 </div>

 <PrimaryActionButton className="w-full gap-2" onClick={handleSubmit} disabled={submitting}>
 <Send className="h-4 w-4" />
 {submitting ? t.submitting : t.submit}
 </PrimaryActionButton>
 </div>
 </SectionCard>

 <SectionCard title={t.requestHistory}>
 <RequestList
 requests={requests}
 emptyText={t.noRequests}
 lang={lang}
 onCancel={handleCancelRequest}
 cancelingId={cancelingId}
 cancelLabel={t.cancelRequest}
 cancelingLabel={t.canceling}
 />
 </SectionCard>
 </div>
 </TabsContent>

 <TabsContent value="records" className="space-y-4">
 <div className="grid gap-4 xl:grid-cols-2">
 <SectionCard title={t.profile}>
 <div className="space-y-3 text-sm">
 <InfoRow label="Nama" value={data.profile.full_name} />
 <InfoRow label="Email" value={data.profile.email ?? '-'} />
 <InfoRow label="Telefon" value={data.profile.phone ?? '-'} />
 <InfoRow label="Kod pekerja" value={data.profile.employee_code ?? data.primary_staff?.staff_code ?? '-'} />
 <div className="rounded-lg border bg-muted/30 p-3">
 <div className="flex items-center justify-between gap-3">
 <span className="text-muted-foreground">Kelengkapan profil</span>
 <span className="font-semibold">{data.profile.completion_percent}%</span>
 </div>
 <div className="mt-2 h-2 rounded-full bg-muted">
 <div
 className="h-full rounded-full bg-emerald-500"
 style={{ width: `${data.profile.completion_percent}%` }}
 />
 </div>
 {data.profile.missing_fields.length > 0 && (
 <p className="mt-2 text-xs text-muted-foreground">
 {data.profile.missing_fields.slice(0, 4).join(', ')}
 </p>)}
 </div>
 </div>
 </SectionCard>

 <SectionCard title={t.employerRecords}>
 <div className="space-y-3">
 {data.staff_records.map((staff) => (
 <div key={staff.staff_id} className="rounded-lg border bg-white p-4 text-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t.legalEmployer}</p>
 <p className="font-semibold text-stone-950">{staff.legal_entity_name ?? staff.legal_entity_code ?? '-'}</p>
 <p className="text-xs text-muted-foreground">{staff.legal_entity_scope ?? staff.staff_code}</p>
 </div>
 <div className="flex flex-wrap justify-end gap-2">
 {staff.legal_entity_code && <Badge variant="outline">{staff.legal_entity_code}</Badge>}
 <Badge variant={staff.status === 'ACTIVE' ? 'default' : 'secondary'}>{staff.status}</Badge>
 </div>
 </div>
 <div className="mt-3 grid gap-2 sm:grid-cols-2">
 <InfoRow label={t.branch} value={staff.branch_code ? `${staff.branch_code} ${staff.branch_name ?? ''}` : 'HQ / Syarikat'} compact />
 <InfoRow label="Area" value={staff.region_name ?? '-'} compact />
 <InfoRow label={t.bankInfo} value={staff.bank_name ?? '-'} compact />
 <InfoRow label="Akaun" value={staff.account_number_masked ?? '-'} compact />
 </div>
 </div>))}
 </div>
 </SectionCard>
 </div>

 <SectionCard title={t.recentAttendance}>
 {data.attendance.length === 0 ? (
 <p className="text-sm text-muted-foreground">{t.noAttendance}</p>) : (
 <div className="grid gap-2">
 {data.attendance.map((row) => (
 <div key={row.id} className="grid gap-2 rounded-lg border px-3 py-2 text-sm sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
 <div>
 <p className="font-medium">{fmtDate(row.attendance_date)}</p>
 <p className="text-xs text-muted-foreground">{row.branch_code ?? '-'} {row.branch_name ?? ''}</p>
 </div>
 <p>Masuk: {fmtDateTime(row.clock_in)}</p>
 <p>Keluar: {fmtDateTime(row.clock_out)}</p>
 <Badge variant="outline">{row.hours_worked ?? 0} jam</Badge>
 </div>))}
 </div>)}
 </SectionCard>
 </TabsContent>

 <TabsContent value="schedule">
 <SectionCard title={t.schedule}>
 <StaffSchedulePanel />
 </SectionCard>
 </TabsContent>

 <TabsContent value="payroll">
 <StaffPayHrPanel />
 </TabsContent>
 </Tabs>
 </ModuleLayout>
 );
}

function InfoRow({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
 return (
 <div className={cn('flex justify-between gap-3 border-b py-2 last:border-b-0', compact && 'border-b-0 py-1')}>
 <span className="text-muted-foreground">{label}</span>
 <span className="text-right font-medium text-stone-950">{value}</span>
 </div>
 );
}

function RequestList({
 requests,
 emptyText,
 lang,
 onCancel,
 cancelingId,
 cancelLabel,
 cancelingLabel,
}: {
 requests: EmployeeHrServiceRequest[];
 emptyText: string;
 lang: 'ms' | 'en';
 onCancel?: (requestId: string) => void;
 cancelingId?: string | null;
 cancelLabel?: string;
 cancelingLabel?: string;
}) {
 if (requests.length === 0) {
 return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
 }

 return (
 <div className="space-y-2">
 {requests.map((request) => (
 <div key={request.id} className="rounded-lg border bg-white px-4 py-3 text-sm">
 <div className="flex flex-wrap items-start justify-between gap-2">
 <div>
 <p className="font-semibold text-stone-950">{request.title}</p>
 <p className="text-xs text-muted-foreground">
 {request.request_number} - {fmtDateTime(request.created_at)}
 </p>
 </div>
 <span className={cn('rounded-full border px-2 py-0.5 text-xs font-medium', statusBadge(request.status))}>
 {statusLabel(request.status, lang)}
 </span>
 </div>
 <p className="mt-2 line-clamp-2 text-muted-foreground">{request.description}</p>
 <div className="mt-3">
 <div className="flex items-center justify-between text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
 <span>{lang === 'en' ? 'Submit' : 'Hantar'}</span>
 <span>{lang === 'en' ? 'Review' : 'Semak'}</span>
 <span>{lang === 'en' ? 'Approve' : 'Lulus'}</span>
 <span>{lang === 'en' ? 'Done' : 'Selesai'}</span>
 </div>
 <div className="mt-1 h-1.5 rounded-full bg-muted">
 <div
 className={cn(
 'h-full rounded-full',
 request.status === 'REJECTED' || request.status === 'CANCELLED'
 ? 'bg-red-400'
 : request.status === 'COMPLETED'
 ? 'bg-emerald-500'
 : 'bg-amber-500',
 )}
 style={{ width: `${Math.min(100, statusStep(request.status) * 25)}%` }}
 />
 </div>
 </div>
 {(request.start_date || request.end_date || request.legal_entity_code || request.branch_code) && (
 <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
 {request.legal_entity_code && <Badge variant="outline">{request.legal_entity_code}</Badge>}
 {request.branch_code && <Badge variant="secondary">{request.branch_code}</Badge>}
 {request.start_date && <span>{fmtDate(request.start_date)}</span>}
 {request.end_date && <span>- {fmtDate(request.end_date)}</span>}
 </div>)}
 {request.reviewer_note && (
 <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
 {request.reviewer_note}
 </p>)}
 {onCancel && ['SUBMITTED', 'IN_REVIEW'].includes(request.status) && (
 <div className="mt-3 flex justify-end">
 <button
 type="button"
 className="rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
 onClick={() => onCancel(request.id)}
 disabled={cancelingId === request.id}
 >
 {cancelingId === request.id
 ? cancelingLabel ?? (lang === 'en' ? 'Cancelling...' : 'Membatalkan...')
 : cancelLabel ?? (lang === 'en' ? 'Cancel' : 'Batalkan')}
 </button>
 </div>)}
 </div>))}
 </div>
 );
}
