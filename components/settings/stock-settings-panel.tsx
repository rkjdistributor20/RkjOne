'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import {
 createStockItem,
 deleteStockItem,
 updateStockThresholds,
} from '@/lib/settings/api';
import type { SettingsStockItem } from '@/lib/settings/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
 Dialog,
 DialogContent,
 DialogFooter,
 DialogHeader,
 DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/shared/module-ui';
import { SlidersHorizontal } from 'lucide-react';

interface StockSettingsPanelProps {
 stockItems: SettingsStockItem[];
 canEdit: boolean;
 isAdmin: boolean;
 onRefresh: () => Promise<void>;
}

export function StockSettingsPanel({
 stockItems,
 canEdit,
 isAdmin,
 onRefresh,
}: StockSettingsPanelProps) {
 const [thresholds, setThresholds] = useState<Record<string, { min: string; critical: string }>>({});
 const [addOpen, setAddOpen] = useState(false);
 const [itemCode, setItemCode] = useState('');
 const [name, setName] = useState('');
 const [category, setCategory] = useState('');
 const [saving, setSaving] = useState(false);

 useEffect(() => {
 const t: Record<string, { min: string; critical: string }> = {};
 stockItems.forEach((item) => {
 t[item.id] = {
 min: item.min_threshold != null ? String(item.min_threshold) : '',
 critical: item.critical_threshold != null ? String(item.critical_threshold) : '',
 };
 });
 setThresholds(t);
 }, [stockItems]);

 function getThreshold(item: SettingsStockItem) {
 return (
 thresholds[item.id] ?? {
 min: item.min_threshold != null ? String(item.min_threshold) : '',
 critical: item.critical_threshold != null ? String(item.critical_threshold) : '',
 });
 }

 async function saveThreshold(itemId: string) {
 const t = getThreshold(stockItems.find((i) => i.id === itemId)!);
 try {
 await updateStockThresholds(
 itemId,
 t.min ? Number(t.min) : null,
 t.critical ? Number(t.critical) : null);
 toast.success('Ambang dikemaskini');
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal kemaskini');
 }
 }

 async function handleAdd() {
 if (!itemCode.trim() || !name.trim()) {
 toast.error('Kod item dan nama diperlukan');
 return;
 }
 setSaving(true);
 try {
 await createStockItem({
 item_code: itemCode.trim(),
 name: name.trim(),
 category: category.trim() || undefined,
 });
 toast.success('Item stok ditambah');
 setAddOpen(false);
 setItemCode('');
 setName('');
 setCategory('');
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal tambah item');
 } finally {
 setSaving(false);
 }
 }

 async function handleDelete(id: string, itemName: string) {
 if (!confirm(`Padam item stok "${itemName}"?`)) return;
 try {
 await deleteStockItem(id);
 toast.success('Item stok dipadam');
 await onRefresh();
 } catch (err) {
 toast.error(err instanceof Error ? err.message : 'Gagal padam');
 }
 }

 if (!canEdit) {
 return (
 <p className="text-sm text-muted-foreground">Hanya pentadbir boleh edit ambang stok</p>);
 }

 if (stockItems.length === 0) {
 return (
 <EmptyState icon={SlidersHorizontal} title="Tiada item stok" />);
 }

 return (
 <div className="space-y-3">
 {isAdmin && (
 <div className="flex justify-end">
 <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600" onClick={() => setAddOpen(true)}>
 <Plus className="h-4 w-4" />
 Tambah Item Stok
 </Button>
 </div>)}

 {stockItems.map((item) => {
 const t = getThreshold(item);
 return (
 <div key={item.id} className="flex flex-wrap items-end gap-3 rounded-lg border p-3 text-sm">
 <div className="min-w-[180px] flex-1">
 <p className="font-medium">{item.name}</p>
 <p className="text-xs text-muted-foreground">{item.item_code}</p>
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Minimum</label>
 <Input
 type="number"
 className="h-8 w-24"
 value={t.min}
 onChange={(e) =>
 setThresholds({...thresholds,
 [item.id]: {...t, min: e.target.value },
 })
 }
 />
 </div>
 <div className="space-y-1">
 <label className="text-xs text-muted-foreground">Kritikal</label>
 <Input
 type="number"
 className="h-8 w-24"
 value={t.critical}
 onChange={(e) =>
 setThresholds({...thresholds,
 [item.id]: {...t, critical: e.target.value },
 })
 }
 />
 </div>
 <Button size="sm" variant="outline" onClick={() => saveThreshold(item.id)}>
 Simpan
 </Button>
 {isAdmin && (
 <Button
 size="icon"
 variant="ghost"
 className="h-8 w-8 text-destructive"
 onClick={() => handleDelete(item.id, item.name)}
 >
 <Trash2 className="h-4 w-4" />
 </Button>)}
 </div>);
 })}

 <Dialog open={addOpen} onOpenChange={setAddOpen}>
 <DialogContent>
 <DialogHeader>
 <DialogTitle>Tambah Item Stok</DialogTitle>
 </DialogHeader>
 <div className="space-y-3">
 <div className="space-y-1">
 <Label>Kod Item</Label>
 <Input value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="ST-XXX" />
 </div>
 <div className="space-y-1">
 <Label>Nama</Label>
 <Input value={name} onChange={(e) => setName(e.target.value)} />
 </div>
 <div className="space-y-1">
 <Label>Kategori</Label>
 <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Roti / Bahan" />
 </div>
 </div>
 <DialogFooter>
 <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
 <Button className="bg-amber-500 hover:bg-amber-600" disabled={saving} onClick={handleAdd}>
 {saving ? 'Menyimpan...' : 'Simpan'}
 </Button>
 </DialogFooter>
 </DialogContent>
 </Dialog>
 </div>);
}
