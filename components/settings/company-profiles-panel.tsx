'use client';

import { useEffect, useMemo, useState } from 'react';
import {
 Building2,
 Download,
 Eye,
 FilePlus2,
 Landmark,
 Mail,
 MapPin,
 Pencil,
 Phone,
 Receipt,
 Save,
 Search,
 Trash2,
 X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { LegalEntityCompanyProfile, LegalEntityDocument } from '@/lib/brand/legal-entity-profile';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ModuleLoading, SectionCard } from '@/components/shared/module-ui';
import { DocumentPreviewDialog } from '@/components/shared/document-preview-dialog';
import { fetchJson } from '@/lib/client/fetch-json';
import { cn } from '@/lib/utils';

type CompanyProfileForm = Pick<
 LegalEntityCompanyProfile,
 | 'legalName'
 | 'name'
 | 'scope'
 | 'address'
 | 'phone'
 | 'email'
 | 'registrationNo'
 | 'taxId'
 | 'bankName'
 | 'bankAccountName'
 | 'bankAccountNo'
>;

type BranchOption = {
 id: string;
 branch_code: string;
 branch_name: string;
 area?: string | null;
};

type DocumentForm = {
 id: string | null;
 code: string;
 title: string;
 documentType: string;
 branchName: string;
 issueDate: string;
 expiryDate: string;
 notes: string;
 file: File | null;
};

function toForm(company: LegalEntityCompanyProfile): CompanyProfileForm {
 return {
 legalName: company.legalName,
 name: company.name,
 scope: company.scope ?? '',
 address: company.address ?? '',
 phone: company.phone ?? '',
 email: company.email ?? '',
 registrationNo: company.registrationNo ?? '',
 taxId: company.taxId ?? '',
 bankName: company.bankName ?? '',
 bankAccountName: company.bankAccountName ?? '',
 bankAccountNo: company.bankAccountNo ?? '',
 };
}

function emptyDocumentForm(code: string): DocumentForm {
 return {
 id: null,
 code,
 title: '',
 documentType: 'SSM',
 branchName: '',
 issueDate: '',
 expiryDate: '',
 notes: '',
 file: null,
 };
}

function formFromDocument(code: string, doc: LegalEntityDocument): DocumentForm {
 return {
 id: doc.id,
 code,
 title: doc.title,
 documentType: doc.documentType,
 branchName: doc.branchName ?? '',
 issueDate: doc.issueDate ?? '',
 expiryDate: doc.expiryDate ?? '',
 notes: doc.notes ?? '',
 file: null,
 };
}

const DOCUMENT_LABELS: Record<string, string> = {
 SSM: 'SSM / Pendaftaran',
 LICENSE: 'Lesen / Permit',
 HALAL: 'Halal',
 KKM: 'KKM / Kesihatan',
 BRANCH: 'Dokumen Cawangan',
 EQUIPMENT: 'Dokumen & Peralatan',
 OTHER: 'Lain-lain',
};

const DOCUMENT_TYPES = Object.entries(DOCUMENT_LABELS);

function normalize(text: string) {
 return text.toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}

function matchBranch(branchName: string | null, branches: BranchOption[]) {
 if (!branchName) return null;
 const needle = normalize(branchName);
 return (
 branches.find((branch) => normalize(branch.branch_name) === needle) ??
 branches.find((branch) => needle.includes(normalize(branch.branch_name)) || normalize(branch.branch_name).includes(needle)) ??
 null);
}

function filesize(bytes: number | null) {
 if (!bytes) return null;
 if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
 return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDocDate(value: string) {
 return new Intl.DateTimeFormat('ms-MY', {
 day: '2-digit',
 month: 'short',
 year: 'numeric',
 }).format(new Date(value));
}

export function CompanyProfilesPanel() {
 const [companies, setCompanies] = useState<LegalEntityCompanyProfile[]>([]);
 const [branches, setBranches] = useState<BranchOption[]>([]);
 const [loading, setLoading] = useState(true);
 const [error, setError] = useState<string | null>(null);
 const [selectedCode, setSelectedCode] = useState<string>('');
 const [editingCompany, setEditingCompany] = useState(false);
 const [form, setForm] = useState<CompanyProfileForm | null>(null);
 const [saving, setSaving] = useState(false);
 const [docForm, setDocForm] = useState<DocumentForm | null>(null);
 const [docSaving, setDocSaving] = useState(false);
 const [query, setQuery] = useState('');
 const [typeFilter, setTypeFilter] = useState('ALL');
 const [branchFilter, setBranchFilter] = useState('ALL');
 const [previewDoc, setPreviewDoc] = useState<LegalEntityDocument | null>(null);

 async function loadData() {
 const [companyBody, branchBody] = await Promise.all([
 fetchJson<{ companies: LegalEntityCompanyProfile[] }>(
 '/api/legal-entities',
 undefined,
 { ttlMs: 30_000 }),
 fetchJson<{ groups?: Array<{ branches: BranchOption[] }> }>(
 '/api/settings/branches?grouped=1',
 undefined,
 { ttlMs: 60_000 }),
 ]);
 setCompanies(companyBody.companies ?? []);
 setSelectedCode((current) => current || companyBody.companies?.[0]?.code || '');

 const nextBranches = (branchBody.groups ?? []).flatMap((group: { branches: BranchOption[] }) => group.branches ?? []);
 setBranches(nextBranches);
 }

 useEffect(() => {
 void (async () => {
 try {
 await loadData();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Gagal muat');
 } finally {
 setLoading(false);
 }
 })();
 }, []);

 const selectedCompany = companies.find((company) => company.code === selectedCode) ?? companies[0] ?? null;
 const documents = useMemo(() => selectedCompany?.documents ?? [], [selectedCompany?.documents]);
 const branchNames = useMemo(
 () => [...new Set(documents.map((doc) => doc.branchName).filter(Boolean) as string[])].sort(),
 [documents]);
 const branchProfiles = useMemo(() => {
 if (selectedCompany?.code !== 'RKJ') return [];
 return branches.map((branch) => {
 const branchDocs = documents.filter((doc) => matchBranch(doc.branchName, branches)?.id === branch.id);
 const categories = [...new Set(branchDocs.map((doc) => DOCUMENT_LABELS[doc.documentType] ?? doc.documentType))];
 return {...branch, documents: branchDocs, categories };
 });
 }, [branches, documents, selectedCompany?.code]);
 const docsByType = useMemo(
 () =>
 documents.reduce<Record<string, number>>((acc, doc) => {
 acc[doc.documentType] = (acc[doc.documentType] ?? 0) + 1;
 return acc;
 }, {}),
 [documents]);
 const filteredDocuments = useMemo(() => {
 const needle = query.trim().toLowerCase();
 return documents.filter((doc) => {
 const matchQuery =
 !needle ||
 doc.title.toLowerCase().includes(needle) ||
 doc.fileName.toLowerCase().includes(needle) ||
 (doc.branchName ?? '').toLowerCase().includes(needle);
 const matchType = typeFilter === 'ALL' || doc.documentType === typeFilter;
 const matchedBranch = matchBranch(doc.branchName, branches);
 const matchBranchSelection =
 branchFilter === 'ALL' ||
 (doc.branchName ?? '') === branchFilter ||
 matchedBranch?.branch_name === branchFilter ||
 matchedBranch?.branch_code === branchFilter;
 return matchQuery && matchType && matchBranchSelection;
 });
 }, [branchFilter, branches, documents, query, typeFilter]);

 function startCompanyEdit(company: LegalEntityCompanyProfile) {
 setForm(toForm(company));
 setEditingCompany(true);
 }

 function updateForm(key: keyof CompanyProfileForm, value: string) {
 setForm((prev) => (prev ? {...prev, [key]: value } : prev));
 }

 async function saveCompany() {
 if (!selectedCompany || !form) return;
 setSaving(true);
 try {
 const body = await fetchJson<{ companies: LegalEntityCompanyProfile[] }>('/api/legal-entities', {
 method: 'PATCH',
 body: JSON.stringify({ code: selectedCompany.code,...form }),
 });
 setCompanies(body.companies ?? []);
 setEditingCompany(false);
 setForm(null);
 toast.success('Profil syarikat dikemaskini');
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal simpan');
 } finally {
 setSaving(false);
 }
 }

 function openNewDocument() {
 if (!selectedCompany) return;
 setDocForm(emptyDocumentForm(selectedCompany.code));
 }

 function openEditDocument(doc: LegalEntityDocument) {
 if (!selectedCompany) return;
 setDocForm(formFromDocument(selectedCompany.code, doc));
 }

 function updateDocForm(key: keyof DocumentForm, value: string | File | null) {
 setDocForm((prev) => (prev ? {...prev, [key]: value } : prev));
 }

 async function saveDocument() {
 if (!docForm) return;
 setDocSaving(true);
 try {
 const payload = new FormData();
 if (docForm.id) payload.set('id', docForm.id);
 payload.set('code', docForm.code);
 payload.set('title', docForm.title);
 payload.set('documentType', docForm.documentType);
 payload.set('branchName', docForm.branchName);
 payload.set('issueDate', docForm.issueDate);
 payload.set('expiryDate', docForm.expiryDate);
 payload.set('notes', docForm.notes);
 if (docForm.file) payload.set('file', docForm.file);

 await fetchJson('/api/legal-entities/documents', { method: 'POST', body: payload });
 await loadData();
 setDocForm(null);
 toast.success('Dokumen dikemaskini');
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal simpan dokumen');
 } finally {
 setDocSaving(false);
 }
 }

 async function archiveDocument(doc: LegalEntityDocument) {
 if (!confirm(`Arkibkan dokumen "${doc.title}"?`)) return;
 try {
 await fetchJson(`/api/legal-entities/documents?id=${doc.id}`, { method: 'DELETE' });
 await loadData();
 toast.success('Dokumen diarkibkan');
 } catch (e) {
 toast.error(e instanceof Error ? e.message : 'Gagal arkib dokumen');
 }
 }

 function previewUrl(doc: LegalEntityDocument) {
 return `/api/legal-entities/documents/${doc.id}/download?mode=view`;
 }

 function canInlinePreview(doc: LegalEntityDocument) {
 const mime = doc.mimeType?.toLowerCase() ?? '';
 const file = doc.fileName.toLowerCase();
 return mime.includes('pdf') || mime.startsWith('image/') || /\.(pdf|png|jpe?g|webp)$/i.test(file);
 }

 function openPreview(doc: LegalEntityDocument) {
 if (!doc.downloadUrl) return;
 if (canInlinePreview(doc)) {
 setPreviewDoc(doc);
 return;
 }
 window.open(previewUrl(doc), '_blank', 'noopener,noreferrer');
 }

 if (loading) return <ModuleLoading rows={2} />;
 if (error) return <p className="text-sm text-destructive">{error}</p>;
 if (!selectedCompany) return <p className="text-sm text-muted-foreground">Tiada profile syarikat.</p>;

 return (
 <div className="space-y-5">
 <SectionCard
 title="Profil Syarikat Kumpulan"
 description="Pilih nama syarikat untuk buka profile, dokumen, lesen dan rekod cawangan berkaitan."
 action={<Badge variant="outline">{companies.length} syarikat</Badge>}
 >
 <div className="grid gap-3 lg:grid-cols-3">
 {companies.map((company) => {
 const active = selectedCompany.code === company.code;
 const docCount = company.documents?.length ?? 0;
 return (
 <button
 key={company.code}
 type="button"
 onClick={() => {
 setSelectedCode(company.code);
 setEditingCompany(false);
 setForm(null);
 setDocForm(null);
 setQuery('');
 setTypeFilter('ALL');
 setBranchFilter('ALL');
 setPreviewDoc(null);
 }}
 className={cn(
 'rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm',
 active ? 'border-primary bg-primary/10 shadow-sm' : 'bg-background')}
 >
 <div className="flex items-start gap-3">
 <LegalEntityLogo size={38} />
 <div className="min-w-0 flex-1">
 <Badge variant={active ? 'default' : 'outline'} className="mb-1 font-mono text-[10px]">
 {company.code}
 </Badge>
 <p className="truncate text-sm font-semibold text-foreground">{company.legalName}</p>
 <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{company.scope}</p>
 </div>
 </div>
 <div className="mt-3 flex flex-wrap gap-1.5">
 <Badge variant="secondary">{docCount} dokumen</Badge>
 {company.registrationNo && <Badge variant="outline">SSM lengkap</Badge>}
 </div>
 </button>);
 })}
 </div>
 </SectionCard>



 {selectedCompany.code === 'RKJ' && (
 <SectionCard
 title="Profile Cawangan Roti Kaya Junus"
 description="Pilih cawangan untuk lihat dokumen, lesen, rekod profile dan maklumat operasi yang duduk bawah cawangan tersebut."
 action={<Badge variant="outline">{branchProfiles.length} cawangan</Badge>}
 >
 <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
 {branchProfiles.map((branch) => {
 const active = branchFilter === branch.branch_name;
 return (
 <button
 key={branch.id}
 type="button"
 onClick={() => setBranchFilter(active ? 'ALL' : branch.branch_name)}
 className={cn(
 'rounded-xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm',
 active ? 'border-primary bg-primary/10 shadow-sm' : 'bg-background')}
 >
 <div className="flex items-start justify-between gap-3">
 <div className="min-w-0">
 <Badge variant={active ? 'default' : 'outline'} className="mb-2 font-mono">
 {branch.branch_code}
 </Badge>
 <p className="line-clamp-2 font-semibold text-foreground">{branch.branch_name}</p>
 <p className="mt-1 text-xs text-muted-foreground">{branch.area ?? 'Area belum ditetapkan'}</p>
 </div>
 <div className="rounded-lg bg-muted px-2.5 py-1 text-sm font-semibold">{branch.documents.length}</div>
 </div>
 <div className="mt-3 flex flex-wrap gap-1.5">
 {branch.categories.length ? (
 branch.categories.slice(0, 3).map((category) => (
 <Badge key={category} variant="secondary" className="text-[10px]">
 {category}
 </Badge>))) : (
 <Badge variant="outline" className="text-[10px]">Belum ada dokumen</Badge>)}
 </div>
 </button>);
 })}
 </div>
 </SectionCard>)}

 <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.95fr)_minmax(0,1.45fr)]">
 <SectionCard
 title={selectedCompany.legalName}
 description={selectedCompany.scope ?? selectedCompany.name}
 action={
 editingCompany ? (
 <div className="flex gap-2">
 <Button size="sm" className="gap-1.5" onClick={saveCompany} disabled={saving}>
 <Save className="h-4 w-4" />
 Simpan
 </Button>
 <Button
 size="sm"
 variant="outline"
 onClick={() => {
 setEditingCompany(false);
 setForm(null);
 }}
 disabled={saving}
 >
 <X className="h-4 w-4" />
 </Button>
 </div>) : (
 <Button size="sm" variant="outline" className="gap-1.5" onClick={() => startCompanyEdit(selectedCompany)}>
 <Pencil className="h-4 w-4" />
 Edit Profile
 </Button>)
 }
 >
 {editingCompany && form ? (
 <div className="grid gap-3">
 <Field label="Nama legal syarikat" value={form.legalName} onChange={(v) => updateForm('legalName', v)} />
 <Field label="Nama paparan" value={form.name} onChange={(v) => updateForm('name', v)} />
 <Field label="Skop syarikat" value={form.scope ?? ''} onChange={(v) => updateForm('scope', v)} />
 <Field label="Alamat pejabat / operasi" value={form.address ?? ''} onChange={(v) => updateForm('address', v)} />
 <div className="grid gap-3 sm:grid-cols-2">
 <Field label="Telefon" value={form.phone ?? ''} onChange={(v) => updateForm('phone', v)} />
 <Field label="Email" value={form.email ?? ''} onChange={(v) => updateForm('email', v)} />
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <Field label="No. SSM / Pendaftaran" value={form.registrationNo ?? ''} onChange={(v) => updateForm('registrationNo', v)} />
 <Field label="SST / TIN" value={form.taxId ?? ''} onChange={(v) => updateForm('taxId', v)} />
 </div>
 <div className="grid gap-3 sm:grid-cols-3">
 <Field label="Bank" value={form.bankName ?? ''} onChange={(v) => updateForm('bankName', v)} />
 <Field label="Nama akaun" value={form.bankAccountName ?? ''} onChange={(v) => updateForm('bankAccountName', v)} />
 <Field label="No. akaun" value={form.bankAccountNo ?? ''} onChange={(v) => updateForm('bankAccountNo', v)} />
 </div>
 </div>) : (
 <div className="space-y-3 text-sm">
 <Info icon={MapPin} label="Alamat" value={selectedCompany.address} />
 <Info icon={Phone} label="Telefon" value={selectedCompany.phone} />
 <Info icon={Mail} label="Email" value={selectedCompany.email} />
 <Info icon={Building2} label="SSM / Pendaftaran" value={selectedCompany.registrationNo} />
 <Info icon={Receipt} label="SST / TIN" value={selectedCompany.taxId ?? 'Tiada / belum didaftarkan'} />
 <div className="rounded-xl border border-dashed bg-muted/30 p-3 text-xs">
 <div className="mb-1 flex items-center gap-1.5 font-semibold">
 <Landmark className="h-3.5 w-3.5" />
 Akaun Bank Rasmi
 </div>
 <p>Bank: {selectedCompany.bankName ?? '-'}</p>
 <p>Nama: {selectedCompany.bankAccountName ?? '-'}</p>
 <p className="font-mono">No: {selectedCompany.bankAccountNo ?? '-'}</p>
 </div>
 </div>)}
 </SectionCard>

 <SectionCard
 title="Document Control Syarikat"
 description="Dokumen boleh ditambah, dikemaskini, dipadankan dengan cawangan dan dimuat turun bila diperlukan."
 action={
 <Button size="sm" className="gap-1.5" onClick={openNewDocument}>
 <FilePlus2 className="h-4 w-4" />
 Tambah Dokumen
 </Button>
 }
 >
 <div className="grid gap-3 lg:grid-cols-4">
 <div className="rounded-xl border bg-muted/20 p-3">
 <p className="text-xs text-muted-foreground">Jumlah Dokumen</p>
 <p className="text-2xl font-semibold">{documents.length}</p>
 </div>
 {DOCUMENT_TYPES.slice(0, 3).map(([type, label]) => (
 <div key={type} className="rounded-xl border bg-muted/20 p-3">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="text-2xl font-semibold">{docsByType[type] ?? 0}</p>
 </div>))}
 </div>

 {docForm && (
 <div className="mt-4 rounded-xl border bg-background p-4">
 <div className="mb-3 flex items-center justify-between gap-2">
 <div>
 <p className="font-semibold">{docForm.id ? 'Edit Dokumen' : 'Tambah Dokumen Baharu'}</p>
 <p className="text-xs text-muted-foreground">Update metadata semasa atau pilih fail baru untuk gantikan fail download.</p>
 </div>
 <Button size="sm" variant="ghost" onClick={() => setDocForm(null)}>
 <X className="h-4 w-4" />
 </Button>
 </div>
 <div className="grid gap-3 lg:grid-cols-2">
 <Field label="Tajuk dokumen" value={docForm.title} onChange={(v) => updateDocForm('title', v)} />
 <div className="space-y-1">
 <Label>Kategori</Label>
 <select
 className="h-10 w-full rounded-md border bg-background px-3 text-sm"
 value={docForm.documentType}
 onChange={(e) => updateDocForm('documentType', e.target.value)}
 >
 {DOCUMENT_TYPES.map(([type, label]) => (
 <option key={type} value={type}>
 {label}
 </option>))}
 </select>
 </div>
 <div className="space-y-1">
 <Label>Cawangan berkaitan</Label>
 <select
 className="h-10 w-full rounded-md border bg-background px-3 text-sm"
 value={docForm.branchName}
 onChange={(e) => updateDocForm('branchName', e.target.value)}
 >
 <option value="">Tidak berkaitan / HQ</option>
 {[...new Set([...branches.map((b) => b.branch_name),...branchNames])].sort().map((name) => (
 <option key={name} value={name}>
 {name}
 </option>))}
 </select>
 </div>
 <div className="grid gap-3 sm:grid-cols-2">
 <Field label="Tarikh mula/isu" type="date" value={docForm.issueDate} onChange={(v) => updateDocForm('issueDate', v)} />
 <Field label="Tarikh tamat" type="date" value={docForm.expiryDate} onChange={(v) => updateDocForm('expiryDate', v)} />
 </div>
 <div className="space-y-1 lg:col-span-2">
 <Label>Nota</Label>
 <textarea
 className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
 value={docForm.notes}
 onChange={(e) => updateDocForm('notes', e.target.value)}
 />
 </div>
 <div className="space-y-1 lg:col-span-2">
 <Label>Fail dokumen PDF/Excel</Label>
 <Input
 type="file"
 accept=".pdf,.xlsx,.xls,.png,.jpg,.jpeg"
 onChange={(e) => updateDocForm('file', e.target.files?.[0] ?? null)}
 />
 </div>
 </div>
 <div className="mt-4 flex justify-end gap-2">
 <Button variant="outline" onClick={() => setDocForm(null)} disabled={docSaving}>
 Batal
 </Button>
 <Button className="gap-1.5" onClick={saveDocument} disabled={docSaving}>
 <Save className="h-4 w-4" />
 Simpan Dokumen
 </Button>
 </div>
 </div>)}

 <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_180px_220px]">
 <div className="relative">
 <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
 <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cari nama dokumen, fail atau cawangan" />
 </div>
 <select className="h-10 rounded-md border bg-background px-3 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
 <option value="ALL">Semua kategori</option>
 {DOCUMENT_TYPES.map(([type, label]) => (
 <option key={type} value={type}>{label}</option>))}
 </select>
 <select className="h-10 rounded-md border bg-background px-3 text-sm" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
 <option value="ALL">Semua cawangan</option>
 {branchNames.map((name) => (
 <option key={name} value={name}>{name}</option>))}
 </select>
 </div>

 <div className="mt-4 overflow-hidden rounded-xl border">
 <div className="hidden grid-cols-[1.5fr_0.8fr_1fr_0.75fr_auto] gap-3 border-b bg-muted/40 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
 <span>Dokumen</span>
 <span>Kategori</span>
 <span>Cawangan</span>
 <span>Status</span>
 <span className="text-right">Tindakan</span>
 </div>
 {filteredDocuments.length === 0 ? (
 <p className="px-4 py-10 text-center text-sm text-muted-foreground">Tiada dokumen untuk pilihan ini.</p>) : (
 filteredDocuments.map((doc) => {
 const branch = matchBranch(doc.branchName, branches);
 return (
 <div key={doc.id} className="grid gap-3 border-b px-3 py-3 text-sm last:border-b-0 lg:grid-cols-[1.5fr_0.8fr_1fr_0.75fr_auto] lg:items-center">
 <div className="min-w-0">
 <p className="font-semibold text-foreground">{doc.title}</p>
 <p className="truncate text-xs text-muted-foreground">
 {doc.fileName}
 {filesize(doc.fileSize) ? ` - ${filesize(doc.fileSize)}` : ''}
 </p>
 {(doc.issueDate || doc.expiryDate) && (
 <p className="mt-1 text-xs text-muted-foreground">
 {doc.issueDate ? `Mula ${formatDocDate(doc.issueDate)}` : ''}
 {doc.expiryDate ? ` - Tamat ${formatDocDate(doc.expiryDate)}` : ''}
 </p>)}
 </div>
 <div>
 <Badge variant="secondary">{DOCUMENT_LABELS[doc.documentType] ?? doc.documentType}</Badge>
 </div>
 <div className="text-xs text-muted-foreground">
 <p className="font-medium text-foreground">{doc.branchName ?? 'HQ / Syarikat'}</p>
 {branch ? (
 <p>Padan: {branch.branch_code} - {branch.area ?? 'Cawangan aktif'}</p>) : doc.branchName ? (
 <p className="text-amber-700">Belum padan dengan kod cawangan</p>) : (
 <p>Tidak berkaitan cawangan</p>)}
 </div>
 <div className="flex flex-wrap gap-1.5">
 <Badge variant={doc.downloadUrl ? 'outline' : 'secondary'}>
 {doc.downloadUrl ? 'Fail tersedia' : 'Metadata sahaja'}
 </Badge>
 {doc.expiryDate && new Date(doc.expiryDate) < new Date() && <Badge variant="secondary">Tamat tempoh</Badge>}
 </div>
 <div className="flex justify-end gap-1.5">
 <Button size="sm" variant="outline" className="gap-1.5" disabled={!doc.downloadUrl} onClick={() => openPreview(doc)}>
 <Eye className="h-3.5 w-3.5" />
 View
 </Button>
 <Button size="sm" variant="outline" className="gap-1.5" disabled={!doc.downloadUrl} onClick={() => {
 if (doc.downloadUrl) window.open(doc.downloadUrl, '_blank', 'noopener,noreferrer');
 }}>
 <Download className="h-3.5 w-3.5" />
 Download
 </Button>
 <Button size="sm" variant="ghost" onClick={() => openEditDocument(doc)}>
 <Pencil className="h-3.5 w-3.5" />
 </Button>
 <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => archiveDocument(doc)}>
 <Trash2 className="h-3.5 w-3.5" />
 </Button>
 </div>
 </div>);
 }))}
 </div>
 </SectionCard>
 </div>

 {previewDoc && (
 <DocumentPreviewDialog
 open={Boolean(previewDoc)}
 title={previewDoc.title}
 fileName={previewDoc.fileName}
 mimeType={previewDoc.mimeType}
 viewUrl={previewUrl(previewDoc)}
 downloadUrl={previewDoc.downloadUrl}
 onClose={() => setPreviewDoc(null)}
 />
 )}

 </div>);
}

function Field({
 label,
 value,
 onChange,
 type = 'text',
}: {
 label: string;
 value: string;
 onChange: (value: string) => void;
 type?: string;
}) {
 return (
 <div className="space-y-1">
 <Label>{label}</Label>
 <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
 </div>);
}

function Info({
 icon: Icon,
 label,
 value,
}: {
 icon: LucideIcon;
 label: string;
 value: string | null;
}) {
 return (
 <div className="flex gap-2 rounded-lg border bg-muted/15 px-3 py-2">
 <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
 <div className="min-w-0">
 <p className="text-xs text-muted-foreground">{label}</p>
 <p className="break-words font-medium text-foreground">{value ?? '-'}</p>
 </div>
 </div>);
}
