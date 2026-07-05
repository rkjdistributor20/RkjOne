'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
 Briefcase,
 Camera,
 CheckCircle2,
 HeartPulse,
 Home,
 Loader2,
 Sparkles,
 User,
} from 'lucide-react';
import { toast } from 'sonner';
import {
 fetchMyProfile,
 updateMyProfile,
 uploadProfileAvatar,
 type ProfileMe,
} from '@/lib/profile/api';
import {
 GENDER_OPTIONS,
 MALAYSIA_STATES,
 type ProfileDetailsPayload,
 type ProfileGender,
} from '@/lib/profile/fields';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/profile/requirements';
import { avatarReminderSeed, pickAvatarReminderMessage } from '@/lib/profile/avatar-reminder';
import { ROLE_LABELS } from '@/types/enums';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';
import { SectionCard } from '@/components/shared/module-ui';
import { StaffPayHrPanel } from '@/components/staff/staff-pay-hr-panel';
import { BRAND_COLORS, COMPANY } from '@/lib/brand/company';
import { LEGAL_ENTITIES, LEGAL_ENTITY_GROUP_NOTE, AREA_MANAGER_OPERATING_SCOPE, SHARED_BRAND_LOGO_NOTE } from '@/lib/brand/legal-entities';
import { LegalEntityLogo } from '@/components/brand/legal-entity-logo';

function initials(name: string) {
 return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

function profileToForm(p: ProfileMe): ProfileDetailsPayload {
 return {
 full_name: p.full_name,
 phone: p.phone ?? '',
 ic_number: p.ic_number ?? '',
 date_of_birth: p.date_of_birth ?? '',
 gender: (p.gender as ProfileGender | null) ?? null,
 nationality: p.nationality ?? 'Malaysia',
 address_line1: p.address_line1 ?? '',
 address_line2: p.address_line2 ?? '',
 city: p.city ?? '',
 state: p.state ?? '',
 postcode: p.postcode ?? '',
 emergency_contact_name: p.emergency_contact_name ?? '',
 emergency_contact_phone: p.emergency_contact_phone ?? '',
 emergency_contact_relation: p.emergency_contact_relation ?? '',
 };
}

function ProfileCompletionBar({ profile }: { profile: ProfileMe }) {
 return (
 <div
 className="rounded-2xl border bg-white p-5 shadow-sm"
 style={{ borderColor: `${BRAND_COLORS.gold}44` }}
 >
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div>
 <p className="text-xs font-bold uppercase tracking-wider text-primary">
 Kelengkapan Profil HR
 </p>
 <p className="mt-1 text-sm text-muted-foreground">
 {profile.profile_complete
 ? 'Profil wajib lengkap - terima kasih.'
 : 'Sila lengkapkan medan wajib (*) untuk rekod pekerja syarikat.'}
 </p>
 </div>
 <div className="flex items-center gap-2">
 {profile.profile_complete ? (
 <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
 <CheckCircle2 className="h-3.5 w-3.5" />
 Lengkap
 </Badge>) : (
 <Badge variant="secondary">{profile.completion_percent}%</Badge>)}
 </div>
 </div>
 <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
 <div
 className="h-full rounded-full transition-all duration-500"
 style={{
 width: `${profile.completion_percent}%`,
 backgroundColor: profile.profile_complete ? '#059669' : BRAND_COLORS.gold,
 }}
 />
 </div>
 {!profile.profile_complete && profile.missing_fields.length > 0 && (
 <p className="mt-3 text-xs text-muted-foreground">
 Belum lengkap: {profile.missing_fields.join(' - ')}
 </p>)}
 </div>);
}

export function ProfileSettingsForm() {
 const fileInputRef = useRef<HTMLInputElement>(null);
 const setProfile = useAuthStore((s) => s.setProfile);

 const [loading, setLoading] = useState(true);
 const [saving, setSaving] = useState(false);
 const [uploading, setUploading] = useState(false);
 const [profile, setLocalProfile] = useState<ProfileMe | null>(null);
 const [form, setForm] = useState<ProfileDetailsPayload>({ nationality: 'Malaysia' });
 const [previewUrl, setPreviewUrl] = useState<string | null>(null);

 const syncStore = useCallback(
 (p: ProfileMe) => {
 setLocalProfile(p);
 setForm(profileToForm(p));
 const current = useAuthStore.getState().profile;
 if (current) {
 setProfile({...current,
 full_name: p.full_name,
 phone: p.phone,
 avatar_url: p.avatar_url,
 must_change_password: p.must_change_password,
 });
 }
 },
 [setProfile]);

 useEffect(() => {
 let cancelled = false;
 (async () => {
 try {
 const p = await fetchMyProfile();
 if (!cancelled) syncStore(p);
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal muat profil');
 } finally {
 if (!cancelled) setLoading(false);
 }
 })();
 return () => {
 cancelled = true;
 };
 }, [syncStore]);

 const avatarSrc = previewUrl ?? profile?.avatar_url ?? undefined;
 const needsAvatar = profile?.needs_avatar ?? true;

 const aiReminder = useMemo(() => {
 if (!profile?.id) return null;
 if (profile.profile_complete && !needsAvatar) return null;
 return pickAvatarReminderMessage(avatarReminderSeed('/profile', profile.id));
 }, [profile?.id, profile?.profile_complete, needsAvatar]);

 function patchForm<K extends keyof ProfileDetailsPayload>(
 key: K,
 value: ProfileDetailsPayload[K]) {
 setForm((prev) => ({...prev, [key]: value }));
 }

 async function handleSave(e: React.FormEvent) {
 e.preventDefault();
 setSaving(true);
 try {
 const updated = await updateMyProfile({...form,
 phone: form.phone?.trim() || null,
 ic_number: form.ic_number?.trim() || null,
 date_of_birth: form.date_of_birth?.trim() || null,
 gender: form.gender || null,
 nationality: form.nationality?.trim() || 'Malaysia',
 address_line1: form.address_line1?.trim() || null,
 address_line2: form.address_line2?.trim() || null,
 city: form.city?.trim() || null,
 state: form.state?.trim() || null,
 postcode: form.postcode?.trim() || null,
 emergency_contact_name: form.emergency_contact_name?.trim() || null,
 emergency_contact_phone: form.emergency_contact_phone?.trim() || null,
 emergency_contact_relation: form.emergency_contact_relation?.trim() || null,
 });
 syncStore(updated);
 toast.success(
 updated.profile_complete ? 'Profil HR lengkap' : 'Profil dikemas kini');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal simpan');
 } finally {
 setSaving(false);
 }
 }

 async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
 const file = e.target.files?.[0];
 e.target.value = '';
 if (!file) return;

 if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
 toast.error('Format JPG, PNG atau WebP sahaja');
 return;
 }
 if (file.size > AVATAR_MAX_BYTES) {
 toast.error('Saiz gambar maksimum 5 MB');
 return;
 }

 const objectUrl = URL.createObjectURL(file);
 setPreviewUrl(objectUrl);
 setUploading(true);

 try {
 const updated = await uploadProfileAvatar(file);
 syncStore(updated);
 toast.success('Gambar profil dikemas kini');
 } catch (err) {
 setPreviewUrl(null);
 toast.error(err instanceof Error ? err.message : 'Gagal muat naik');
 } finally {
 setUploading(false);
 URL.revokeObjectURL(objectUrl);
 }
 }

 if (loading) {
 return (
 <div className="flex min-h-[40vh] items-center justify-center">
 <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
 </div>);
 }

 if (!profile) {
 return (
 <div className="mx-auto max-w-md rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
 <p className="font-semibold text-destructive">Profil tidak dapat dimuatkan</p>
 <Button type="button" className="mt-4" variant="outline" onClick={() => window.location.reload()}>
 Muat semula
 </Button>
 </div>);
 }

 return (
 <div className="mx-auto max-w-3xl space-y-6">
 {aiReminder && (
 <div className="rounded-xl border border-[#E5A812]/30 bg-gradient-to-br from-[#FFF4D6]/80 via-white to-[#FAFAFA] p-4">
 <div className="flex gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E5A812] text-[#141414]">
 <Sparkles className="h-4 w-4" />
 </div>
 <div>
 <p className="text-xs font-semibold uppercase tracking-wider text-primary">
 RKJ One AI
 </p>
 <p className="mt-1 text-sm text-muted-foreground">{aiReminder}</p>
 </div>
 </div>
 </div>)}

 <ProfileCompletionBar profile={profile} />

 <SectionCard title="Gambar & Identiti Portal">
 <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
 <div className="relative mx-auto sm:mx-0">
 <Avatar className="h-28 w-28 ring-4 ring-primary/20" data-size="lg">
 {avatarSrc ? (
 <AvatarImage src={avatarSrc} alt={profile.full_name} />) : null}
 <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
 {initials(profile.full_name)}
 </AvatarFallback>
 </Avatar>
 <Button
 type="button"
 size="icon"
 variant="secondary"
 className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full shadow-md"
 disabled={uploading}
 onClick={() => fileInputRef.current?.click()}
 >
 {uploading ? (
 <Loader2 className="h-4 w-4 animate-spin" />) : (
 <Camera className="h-4 w-4" />)}
 </Button>
 <input
 ref={fileInputRef}
 type="file"
 accept={AVATAR_MIME_TYPES.join(',')}
 className="hidden"
 aria-label="Muat naik gambar profil"
 onChange={handleAvatarPick}
 />
 </div>
 <div className="flex-1 space-y-2 text-center sm:text-left">
 <p className="text-lg font-semibold">{profile.full_name}</p>
 <p className="text-sm text-muted-foreground">{profile.email}</p>
 <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
 <Badge variant="secondary">
 {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS]}
 </Badge>
 {profile.employee_code && (
 <Badge variant="outline">{profile.employee_code}</Badge>)}
 {profile.branch && (
 <Badge variant="outline">
 {profile.branch.branch_code} - {profile.branch.branch_name}
 </Badge>)}
 {profile.region && (
 <Badge variant="outline">{profile.region.region_name}</Badge>)}
 </div>
 <p className="text-xs text-muted-foreground">
 Gambar muka sebenar - JPG/PNG/WebP - maks. 5 MB
 </p>
 </div>
 </div>
 </SectionCard>

 <form onSubmit={handleSave} className="space-y-6">
 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <User className="h-4 w-4 text-primary" />
 Maklumat Peribadi
 </span>
 }
 description="Data rasmi pekerja - seperti rekod HR syarikat besar"
 >
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2 sm:col-span-2">
 <Label htmlFor="full_name">Nama Penuh (seperti IC) *</Label>
 <Input
 id="full_name"
 value={form.full_name ?? ''}
 onChange={(e) => patchForm('full_name', e.target.value)}
 minLength={2}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="ic_number">No. Kad Pengenalan / Passport *</Label>
 <Input
 id="ic_number"
 value={form.ic_number ?? ''}
 onChange={(e) => patchForm('ic_number', e.target.value)}
 placeholder="cth. 900101-01-1234"
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="date_of_birth">Tarikh Lahir *</Label>
 <Input
 id="date_of_birth"
 type="date"
 value={form.date_of_birth ?? ''}
 onChange={(e) => patchForm('date_of_birth', e.target.value)}
 required
 />
 </div>
 <div className="space-y-2">
 <Label>Jantina *</Label>
 <Select
 value={form.gender ?? ''}
 onValueChange={(v) => patchForm('gender', v as ProfileGender)}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih jantina" />
 </SelectTrigger>
 <SelectContent>
 {GENDER_OPTIONS.map((o) => (
 <SelectItem key={o.value} value={o.value}>
 {o.label}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="nationality">Warganegara *</Label>
 <Input
 id="nationality"
 value={form.nationality ?? 'Malaysia'}
 onChange={(e) => patchForm('nationality', e.target.value)}
 required
 />
 </div>
 </div>
 </SectionCard>

 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <Home className="h-4 w-4 text-primary" />
 Alamat & Hubungan
 </span>
 }
 description="Alamat semasa dan nombor telefon boleh dihubungi"
 >
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2 sm:col-span-2">
 <Label htmlFor="phone">No. Telefon Bimbit *</Label>
 <Input
 id="phone"
 type="tel"
 value={form.phone ?? ''}
 onChange={(e) => patchForm('phone', e.target.value)}
 placeholder="cth. 012-3456789"
 required
 />
 </div>
 <div className="space-y-2 sm:col-span-2">
 <Label htmlFor="address_line1">Alamat Baris 1 *</Label>
 <Textarea
 id="address_line1"
 rows={2}
 value={form.address_line1 ?? ''}
 onChange={(e) => patchForm('address_line1', e.target.value)}
 placeholder="No. rumah, jalan, taman"
 required
 />
 </div>
 <div className="space-y-2 sm:col-span-2">
 <Label htmlFor="address_line2">Alamat Baris 2</Label>
 <Input
 id="address_line2"
 value={form.address_line2 ?? ''}
 onChange={(e) => patchForm('address_line2', e.target.value)}
 placeholder="Blok / tingkat (pilihan)"
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="city">Bandar *</Label>
 <Input
 id="city"
 value={form.city ?? ''}
 onChange={(e) => patchForm('city', e.target.value)}
 required
 />
 </div>
 <div className="space-y-2">
 <Label>Negeri *</Label>
 <Select
 value={form.state ?? ''}
 onValueChange={(v) => patchForm('state', v)}
 >
 <SelectTrigger>
 <SelectValue placeholder="Pilih negeri" />
 </SelectTrigger>
 <SelectContent>
 {MALAYSIA_STATES.map((s) => (
 <SelectItem key={s} value={s}>
 {s}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 <div className="space-y-2">
 <Label htmlFor="postcode">Poskod *</Label>
 <Input
 id="postcode"
 inputMode="numeric"
 maxLength={5}
 value={form.postcode ?? ''}
 onChange={(e) => patchForm('postcode', e.target.value.replace(/\D/g, ''))}
 placeholder="36000"
 required
 />
 </div>
 </div>
 </SectionCard>

 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <HeartPulse className="h-4 w-4 text-primary" />
 Hubungan Kecemasan
 </span>
 }
 description="Orang yang boleh dihubungi jika berlaku kecemasan di tempat kerja"
 >
 <div className="grid gap-4 sm:grid-cols-2">
 <div className="space-y-2 sm:col-span-2">
 <Label htmlFor="emergency_contact_name">Nama *</Label>
 <Input
 id="emergency_contact_name"
 value={form.emergency_contact_name ?? ''}
 onChange={(e) => patchForm('emergency_contact_name', e.target.value)}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="emergency_contact_phone">No. Telefon *</Label>
 <Input
 id="emergency_contact_phone"
 type="tel"
 value={form.emergency_contact_phone ?? ''}
 onChange={(e) => patchForm('emergency_contact_phone', e.target.value)}
 required
 />
 </div>
 <div className="space-y-2">
 <Label htmlFor="emergency_contact_relation">Hubungan *</Label>
 <Input
 id="emergency_contact_relation"
 value={form.emergency_contact_relation ?? ''}
 onChange={(e) => patchForm('emergency_contact_relation', e.target.value)}
 placeholder="cth. Ibu, Suami, Adik"
 required
 />
 </div>
 </div>
 </SectionCard>

 <SectionCard
 title={
 <span className="flex items-center gap-2">
 <Briefcase className="h-4 w-4 text-primary" />
 Maklumat Pekerjaan
 </span>
 }
 description={`Rekod ${COMPANY.name} - dikemaskini oleh pengurus / HQ`}
 >
 <div
 className="mb-4 rounded-xl border px-4 py-3 text-sm"
 style={{
 borderColor: `${BRAND_COLORS.gold}55`,
 backgroundColor: `${BRAND_COLORS.goldLight}88`,
 }}
 >
 <p className="font-medium text-foreground">Maklumat Syarikat - Satu Pemilik</p>
 <p className="mt-1 text-muted-foreground">{LEGAL_ENTITY_GROUP_NOTE}</p>
 <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
 <LegalEntityLogo size={22} />
 {SHARED_BRAND_LOGO_NOTE}
 </p>
 </div>

 <div className="mb-4 grid gap-2 sm:grid-cols-3">
 {LEGAL_ENTITIES.map((entity) => {
 const isEmployer = profile.legal_entity?.code === entity.code;
 const isOperating = profile.operating_legal_entity?.code === entity.code;
 const active = isEmployer || isOperating;
 return (
 <div
 key={entity.code}
 className="rounded-lg border px-3 py-2.5 text-sm"
 style={
 active
 ? {
 borderColor: BRAND_COLORS.gold,
 backgroundColor: `${BRAND_COLORS.goldLight}66`,
 }
 : undefined
 }
 >
 <div className="flex items-start gap-2.5">
 <LegalEntityLogo size={36} />
 <div className="min-w-0 flex-1">
 <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
 {isEmployer
 ? 'Syarikat majikan'
 : isOperating
 ? 'Operasi diurus'
 : 'Entiti kumpulan'}
 </p>
 <p className="mt-1 font-semibold">{entity.legalName}</p>
 <p className="mt-1 text-xs text-muted-foreground">{entity.scope}</p>
 </div>
 </div>
 </div>);
 })}
 </div>

 <dl className="grid gap-3 text-sm sm:grid-cols-2">
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5 sm:col-span-2">
 <dt className="text-xs text-muted-foreground">Syarikat Majikan</dt>
 <dd className="font-medium">
 {profile.legal_entity?.legal_name ?? profile.legal_entity?.name ?? COMPANY.name}
 </dd>
 {profile.legal_entity?.scope && (
 <dd className="mt-1 text-xs text-muted-foreground">{profile.legal_entity.scope}</dd>)}
 {profile.legal_entity?.office_address && (
 <dd className="mt-2 text-xs text-muted-foreground">{profile.legal_entity.office_address}</dd>)}
 <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
 {profile.legal_entity?.phone && <span>Tel: {profile.legal_entity.phone}</span>}
 {profile.legal_entity?.email && <span>{profile.legal_entity.email}</span>}
 </div>
 {profile.legal_entity?.registration_no && (
 <dd className="mt-1 text-xs">SSM: {profile.legal_entity.registration_no}</dd>)}
 {(profile.legal_entity?.bank_name || profile.legal_entity?.bank_account_no) && (
 <dd className="mt-2 rounded border border-dashed px-2 py-1.5 text-xs">
 {profile.legal_entity.bank_name && <span>Bank: {profile.legal_entity.bank_name} - </span>}
 {profile.legal_entity.bank_account_name && <span>{profile.legal_entity.bank_account_name} - </span>}
 {profile.legal_entity.bank_account_no && (
 <span className="font-mono">{profile.legal_entity.bank_account_no}</span>)}
 </dd>)}
 </div>
 {profile.operating_legal_entity && (
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5 sm:col-span-2">
 <dt className="text-xs text-muted-foreground">Tanggungjawab Operasi</dt>
 <dd className="font-medium">{profile.operating_legal_entity.legal_name}</dd>
 <dd className="mt-1 text-xs text-muted-foreground">
 {AREA_MANAGER_OPERATING_SCOPE}
 </dd>
 </div>)}
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Jenama</dt>
 <dd className="font-medium">{COMPANY.name}</dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Sistem</dt>
 <dd className="font-medium">{COMPANY.systemName}</dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Peranan</dt>
 <dd className="font-medium">
 {ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS]}
 </dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Kod Pekerja</dt>
 <dd className="font-medium">{profile.employee_code ?? profile.staff?.staff_code ?? ' - '}</dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Cawangan</dt>
 <dd className="font-medium">
 {profile.branch
 ? `${profile.branch.branch_code} - ${profile.branch.branch_name}`
 : ' - '}
 </dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Kawasan</dt>
 <dd className="font-medium">{profile.region?.region_name ?? ' - '}</dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Tarikh Daftar Portal</dt>
 <dd className="font-medium">
 {profile.joined_at
 ? new Date(profile.joined_at).toLocaleDateString('ms-MY')
 : ' - '}
 </dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Log Masuk Terakhir</dt>
 <dd className="font-medium">
 {profile.last_login_at
 ? new Date(profile.last_login_at).toLocaleString('ms-MY')
 : ' - '}
 </dd>
 </div>
 {profile.staff && (
 <>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Jenis Pekerja</dt>
 <dd className="font-medium">
 {profile.staff.worker_type === 'LOCAL' ? 'Tempatan' : profile.staff.worker_type === 'FOREIGN' ? 'Asing' : ' - '}
 </dd>
 </div>
 <div className="rounded-lg border bg-muted/20 px-3 py-2.5">
 <dt className="text-xs text-muted-foreground">Bank Gaji</dt>
 <dd className="font-medium">
 {profile.staff.bank_name ?? ' - '}
 {profile.staff.account_number_masked
 ? ` - ${profile.staff.account_number_masked}`
 : ''}
 </dd>
 </div>
 </>)}
 </dl>
 <p className="mt-3 text-xs text-muted-foreground">
 Untuk ubah cawangan, peranan atau bank gaji - hubungi pengurus kawasan / HR.
 </p>
 </SectionCard>

 <div className="flex flex-wrap gap-3">
 <Button type="submit" disabled={saving} className="min-w-[160px]">
 {saving ? (
 <>
 <Loader2 className="mr-2 h-4 w-4 animate-spin" />
 Menyimpan...
 </>) : (
 'Simpan Profil HR')}
 </Button>
 {profile.profile_complete && (
 <span className="flex items-center gap-1.5 text-sm text-emerald-700">
 <CheckCircle2 className="h-4 w-4" />
 Rekod HR lengkap
 </span>)}
 </div>
 </form>

 <StaffPayHrPanel />
 </div>);
}
