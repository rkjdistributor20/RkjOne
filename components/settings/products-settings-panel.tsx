'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { createProduct, deleteProduct } from '@/lib/settings/api';
import { POS_MENU_CATEGORIES } from '@/lib/pos/utils';
import type { SettingsProduct } from '@/lib/settings/types';
import { Badge } from '@/components/ui/badge';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

function fmt(n: number) {
  return `RM ${Number(n).toFixed(2)}`;
}

function categoryBadgeClass(category: string | null | undefined) {
  if (category === 'Pelbagai') {
    return 'border-violet-300 bg-violet-50 text-violet-900';
  }
  return 'font-normal';
}

interface ProductsSettingsPanelProps {
  products: SettingsProduct[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

export function ProductsSettingsPanel({
  products,
  isAdmin,
  onRefresh,
}: ProductsSettingsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<string>(POS_MENU_CATEGORIES[0]);
  const [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingsProduct[]>();
    for (const cat of POS_MENU_CATEGORIES) {
      map.set(cat, []);
    }
    for (const p of products) {
      const key =
        p.category && (POS_MENU_CATEGORIES as readonly string[]).includes(p.category)
          ? p.category
          : 'Lain-lain';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()].filter(([, list]) => list.length > 0);
  }, [products]);

  async function handleAdd() {
    if (!sku.trim() || !name.trim()) {
      toast.error('SKU dan nama diperlukan');
      return;
    }
    setSaving(true);
    try {
      await createProduct({
        sku: sku.trim(),
        name: name.trim(),
        category,
        price: Number(price) || 0,
      });
      toast.success('Produk ditambah');
      setAddOpen(false);
      setSku('');
      setName('');
      setCategory(POS_MENU_CATEGORIES[0]);
      setPrice('');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tambah produk');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, productName: string) {
    if (!confirm(`Padam produk "${productName}"?`)) return;
    try {
      await deleteProduct(id);
      toast.success('Produk dipadam');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal padam');
    }
  }

  return (
    <div className="space-y-4">
      <p className="rounded-md border border-muted bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
        {products.length} produk aktif · 5 tab menu POS (4 roti + Pelbagai). Produk Pelbagai
        perlu BOM stok di HQ jika tolakan automatik diperlukan.
      </p>

      {isAdmin && (
        <div className="flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 bg-amber-500 hover:bg-amber-600"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Tambah Produk
          </Button>
        </div>
      )}

      {grouped.length === 0 ? (
        <p className="text-sm text-muted-foreground">Tiada produk.</p>
      ) : (
        grouped.map(([cat, list]) => (
          <div key={cat} className="overflow-x-auto rounded-lg border">
            <div
              className={cn(
                'border-b px-3 py-2 text-sm font-semibold',
                cat === 'Pelbagai' ? 'bg-violet-50 text-violet-950' : 'bg-muted/50'
              )}
            >
              {cat}
              <Badge variant="outline" className="ml-2 font-normal tabular-nums">
                {list.length}
              </Badge>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/20 text-left text-xs text-muted-foreground">
                  <th className="p-2">SKU</th>
                  <th className="p-2">Nama</th>
                  <th className="p-2">Harga</th>
                  <th className="p-2">Status</th>
                  {isAdmin && <th className="w-10 p-2" />}
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} className="border-b last:border-0">
                    <td className="p-2 font-mono text-xs">{p.sku}</td>
                    <td className="p-2">{p.name}</td>
                    <td className="p-2 tabular-nums">{fmt(p.selling_price)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={categoryBadgeClass(p.category)}>
                        {p.status}
                      </Badge>
                    </td>
                    {isAdmin && (
                      <td className="p-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => handleDelete(p.id, p.name)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Produk POS</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>SKU</Label>
              <Input value={sku} onChange={(e) => setSku(e.target.value.toUpperCase())} />
            </div>
            <div className="space-y-1">
              <Label>Nama</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Menu / Kategori POS</Label>
              <Select value={category} onValueChange={(v) => v && setCategory(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POS_MENU_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Harga (RM)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Batal
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600"
              disabled={saving}
              onClick={handleAdd}
            >
              {saving ? 'Menyimpan…' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
