'use client';

import { useEffect, useState } from 'react';
import { Pencil, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { HrStaffPerson } from '@/lib/hr/company-hr';
import { updateHrProfile } from '@/lib/hr/api';
import {
 LEGAL_ENTITIES,
 type LegalEntityCode,
} from '@/lib/brand/legal-entities';
import { type UserRole } from '@/types/enums';
import {
 getCompanyAccessPreview,
 getCompanyRoleLabel,
 getCompanyRoleOptions,
 getDefaultRoleForCompany,
} from '@/lib/auth/role-labels';
import { useAuthStore } from '@/stores/auth-store';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Dialog,
 DialogContent,
 DialogDescription,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import {
 Select,
 SelectContent,
 SelectItem,
 SelectTrigger,
 SelectValue,
} from '@/components/ui/select';

interface HrProfileEditDialogProps {
 person: HrStaffPerson | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSuccess: () => Promise<void>;
}

export function HrProfileEditDialog({
 person,
 open,
 onOpenChange,
 onSuccess,
}: HrProfileEditDialogProps) {
 const currentProfile = useAuthStore((s) => s.profile);
 const [fullName, setFullName] = useState('');
 const [phone, setPhone] = useState('');
 const [status, setStatus] = useState('ACTIVE');
 const [legalEntityCode, setLegalEntityCode] = useState<LegalEntityCode>('RKJ');
 const [role, setRole] = useState<UserRole>('STAFF');
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (!person || !open) return;
 setFullName(person.full_name);
 setPhone(person.phone ?? '');
 setStatus(person.status);
 setLegalEntityCode((person.legal_entity_code as LegalEntityCode) ?? 'RKJ');
 setRole(person.role === 'STAFF_RECORD' ? 'STAFF' : (person.role as UserRole));
 }, [person, open]);

 function handleLegalEntityChange(nextCode: LegalEntityCode) {
 setLegalEntityCode(nextCode);
 const nextOptions = getCompanyRoleOptions(nextCode);
 if (!nextOptions.includes(role)) {
 setRole(getDefaultRoleForCompany(nextCode));
 }
 }

 async function handleSave() {
 if (!person?.profile_id) return;
 if (!fullName.trim()) {
 toast.error('Nama penuh diperlukan');
 return;
 }

 setSaving(true);
 try {
 await updateHrProfile(person.profile_id, {
 full_name: fullName.trim(),
 phone: phone.trim() || null,
 status,
 legal_entity_code: legalEntityCode,...(canEditAccess ? { role } : {}),
 });
 toast.success('Profil dikemaskini');
 onOpenChange(false);
 await onSuccess();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini profil');
 } finally {
 setSaving(false);
 }
 }

 const roleLabel =
 person?.role === 'STAFF_RECORD'
 ? 'Rekod Staf'
 : getCompanyRoleLabel((person?.role ?? 'STAFF') as UserRole, person?.legal_entity_code);
 const canEditAccess =
 currentProfile?.role === 'SUPER_ADMIN' &&
 Boolean(person?.profile_id) &&
 person?.role !== 'SUPER_ADMIN';
 const roleOptions = getCompanyRoleOptions(legalEntityCode);
 const accessPreview = getCompanyAccessPreview(role, legalEntityCode);

 useEffect(() => {
 if (!open || !canEditAccess) return;
 const options = getCompanyRoleOptions(legalEntityCode);
 if (!options.includes(role)) {
 setRole(getDefaultRoleForCompany(legalEntityCode));
 }
 }, [canEditAccess, legalEntityCode, open, role]);

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <Pencil className="h-4 w-4" />
 Edit Pengguna
 </DialogTitle>
 <DialogDescription>
 Kemaskini maklumat HR untuk {person?.full_name ?? 'pengguna'} ({roleLabel}).
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div className="space-y-2">
 <Label htmlFor="hr-profile-name">Nama penuh</Label>
 <Input
 id="hr-profile-name"
 value={fullName}
 onChange={(e) => setFullName(e.target.value)}
 />
 </div>

 <div className="space-y-2">
 <Label htmlFor="hr-profile-phone">Telefon</Label>
 <Input
 id="hr-profile-phone"
 value={phone}
 onChange={(e) => setPhone(e.target.value)}
 placeholder="Opsyenal"
 />
 </div>

 <div className="space-y-2">
 <Label>Syarikat majikan</Label>
 <Select
 value={legalEntityCode}
 onValueChange={(v) => handleLegalEntityChange(v as LegalEntityCode)}
 >
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {LEGAL_ENTITIES.map((entity) => (
 <SelectItem key={entity.code} value={entity.code}>
 {entity.legalName}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>

 <div className="space-y-2">
 <Label>Status</Label>
 <Select value={status} onValueChange={(v) => setStatus(v ?? 'ACTIVE')}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 <SelectItem value="ACTIVE">ACTIVE</SelectItem>
 <SelectItem value="INACTIVE">INACTIVE</SelectItem>
 </SelectContent>
 </Select>
 </div>

 <div className="rounded-xl border bg-muted/20 p-3">
 <div className="mb-2 flex items-center gap-2">
 <ShieldCheck className="h-4 w-4 text-primary" />
 <Label className="text-sm font-semibold">Tahap akses sistem</Label>
 </div>
 {canEditAccess ? (
 <div className="space-y-3">
 <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
 <SelectTrigger>
 <SelectValue />
 </SelectTrigger>
 <SelectContent>
 {roleOptions.map((item) => (
 <SelectItem key={item} value={item}>
 {getCompanyRoleLabel(item, legalEntityCode)}
 </SelectItem>))}
 </SelectContent>
 </Select>
 <div className="flex flex-wrap gap-1.5">
 {accessPreview.map((item) => (
 <Badge key={item} variant="secondary">
 {item}
 </Badge>))}
 </div>
 <p className="text-xs text-muted-foreground">
 Akses dashboard dan modul akan ikut role ini selepas staf refresh atau log masuk semula.
 </p>
 </div>) : (
 <p className="text-xs text-muted-foreground">
 Hanya Pentadbir Utama boleh tukar tahap akses. Rekod tanpa email portal perlu dicipta sebagai pengguna dahulu.
 </p>)}
 </div>

 {person?.email && (
 <p className="text-xs text-muted-foreground">Email portal: {person.email}</p>)}
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Batal
 </Button>
 <Button onClick={handleSave} disabled={saving || !person?.profile_id}>
 {saving ? 'Menyimpan...' : 'Simpan'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
