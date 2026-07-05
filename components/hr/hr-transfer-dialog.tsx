'use client';

import { useEffect, useState } from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { toast } from 'sonner';
import type { HrStaffPerson } from '@/lib/hr/company-hr';
import {
 transferProfileLegalEntity,
 transferStaffLegalEntity,
} from '@/lib/hr/api';
import {
 LEGAL_ENTITIES,
 legalEntityLabel,
 type LegalEntityCode,
} from '@/lib/brand/legal-entities';
import { Button } from '@/components/ui/button';
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

interface HrTransferDialogProps {
 person: HrStaffPerson | null;
 open: boolean;
 onOpenChange: (open: boolean) => void;
 onSuccess: () => Promise<void>;
}

export function HrTransferDialog({
 person,
 open,
 onOpenChange,
 onSuccess,
}: HrTransferDialogProps) {
 const [targetCode, setTargetCode] = useState<LegalEntityCode>('RKJ');
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 if (!person) return;
 const fallback = LEGAL_ENTITIES.find((e) => e.code !== person.legal_entity_code);
 setTargetCode(fallback?.code ?? 'RKJ');
 }, [person]);

 async function handleTransfer() {
 if (!person) return;
 if (person.legal_entity_code === targetCode) {
 toast.error('Staf sudah berada di syarikat ini');
 return;
 }

 setSaving(true);
 try {
 if (person.source === 'staff' && person.staff_id) {
 await transferStaffLegalEntity(person.staff_id, targetCode);
 } else if (person.profile_id) {
 await transferProfileLegalEntity(person.profile_id, targetCode);
 } else {
 throw new Error('Rekod tidak sah untuk pindah syarikat');
 }
 toast.success(`${person.full_name} dipindah ke ${legalEntityLabel(targetCode)}`);
 onOpenChange(false);
 await onSuccess();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal pindah syarikat');
 } finally {
 setSaving(false);
 }
 }

 const currentLabel = person?.legal_entity_code
 ? legalEntityLabel(person.legal_entity_code as LegalEntityCode)
 : 'Belum ditetapkan';

 return (
 <Dialog open={open} onOpenChange={onOpenChange}>
 <DialogContent className="sm:max-w-md">
 <DialogHeader>
 <DialogTitle className="flex items-center gap-2">
 <ArrowRightLeft className="h-4 w-4" />
 Pindah Syarikat
 </DialogTitle>
 <DialogDescription>
 Pindahkan {person?.full_name ?? 'staf'} ke syarikat legal lain dalam kumpulan RKJ.
 </DialogDescription>
 </DialogHeader>

 <div className="space-y-4 py-2">
 <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
 <p className="text-xs text-muted-foreground">Syarikat semasa</p>
 <p className="font-medium">{currentLabel}</p>
 </div>

 <div className="space-y-2">
 <Label>Syarikat destinasi</Label>
 <Select value={targetCode} onValueChange={(v) => setTargetCode(v as LegalEntityCode)}>
 <SelectTrigger>
 <SelectValue placeholder="Pilih syarikat" />
 </SelectTrigger>
 <SelectContent>
 {LEGAL_ENTITIES.map((entity) => (
 <SelectItem
 key={entity.code}
 value={entity.code}
 disabled={entity.code === person?.legal_entity_code}
 >
 {entity.legalName}
 </SelectItem>))}
 </SelectContent>
 </Select>
 </div>
 </div>

 <DialogFooter>
 <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
 Batal
 </Button>
 <Button onClick={handleTransfer} disabled={saving || !person}>
 {saving ? 'Memindah...' : 'Sahkan Pindah'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>);
}
