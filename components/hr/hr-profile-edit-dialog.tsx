'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { toast } from 'sonner';
import type { HrStaffPerson } from '@/lib/hr/company-hr';
import { updateHrProfile } from '@/lib/hr/api';
import {
  LEGAL_ENTITIES,
  type LegalEntityCode,
} from '@/lib/brand/legal-entities';
import { ROLE_LABELS } from '@/types/enums';
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
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [legalEntityCode, setLegalEntityCode] = useState<LegalEntityCode>('RKJ');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!person || !open) return;
    setFullName(person.full_name);
    setPhone(person.phone ?? '');
    setStatus(person.status);
    setLegalEntityCode((person.legal_entity_code as LegalEntityCode) ?? 'RKJ');
  }, [person, open]);

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
        legal_entity_code: legalEntityCode,
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
      : ROLE_LABELS[person?.role ?? 'STAFF'] ?? person?.role;

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
              onValueChange={(v) => setLegalEntityCode(v as LegalEntityCode)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LEGAL_ENTITIES.map((entity) => (
                  <SelectItem key={entity.code} value={entity.code}>
                    {entity.legalName}
                  </SelectItem>
                ))}
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

          {person?.email && (
            <p className="text-xs text-muted-foreground">Email portal: {person.email}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Batal
          </Button>
          <Button onClick={handleSave} disabled={saving || !person?.profile_id}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
