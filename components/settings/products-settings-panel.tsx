"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Edit3,
  PackageCheck,
  Plus,
  Search,
  SlidersHorizontal,
  Tags,
  Trash2,
} from "lucide-react";
import {
  createProduct,
  deleteProduct,
  updateProduct,
} from "@/lib/settings/api";
import { POS_MENU_CATEGORIES } from "@/lib/pos/utils";
import type { SettingsProduct } from "@/lib/settings/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/module-ui";
import { cn } from "@/lib/utils";

type ProductFormState = {
  sku: string;
  name: string;
  category: string;
  price: string;
  sale_unit: string;
  status: string;
  sort_order: string;
  notes: string;
};

const PRODUCT_STATUS = ["ACTIVE", "INACTIVE"] as const;
const ALL_CATEGORIES = "ALL";

function fmt(n: number) {
  return `RM ${Number(n).toFixed(2)}`;
}

function newProductForm(): ProductFormState {
  return {
    sku: "",
    name: "",
    category: POS_MENU_CATEGORIES[0],
    price: "",
    sale_unit: "Pcs",
    status: "ACTIVE",
    sort_order: "99",
    notes: "",
  };
}

function formFromProduct(product: SettingsProduct): ProductFormState {
  return {
    sku: product.sku ?? "",
    name: product.name ?? "",
    category: product.category ?? POS_MENU_CATEGORIES[0],
    price: String(product.selling_price ?? 0),
    sale_unit: product.sale_unit ?? "Pcs",
    status: product.status ?? "ACTIVE",
    sort_order: String(product.sort_order ?? 99),
    notes: product.notes ?? "",
  };
}

function categoryBadgeClass(category: string | null | undefined) {
  if (category === "Pelbagai")
    return "border-violet-300 bg-violet-50 text-violet-900";
  if (category === "Roti Kaya")
    return "border-amber-300 bg-amber-50 text-amber-900";
  if (category === "Roti Kacang")
    return "border-orange-300 bg-orange-50 text-orange-900";
  if (category === "Roti Kelapa")
    return "border-emerald-300 bg-emerald-50 text-emerald-900";
  if (category === "Roti Benggali")
    return "border-sky-300 bg-sky-50 text-sky-900";
  return "font-normal";
}

function statusBadgeClass(status: string) {
  return status === "ACTIVE"
    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
    : "border-stone-300 bg-stone-50 text-stone-600";
}

function ProductFormFields({
  form,
  setForm,
  disabled,
}: {
  form: ProductFormState;
  setForm: (next: ProductFormState) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-1.5">
        <Label>SKU / Kod Produk</Label>
        <Input
          value={form.sku}
          disabled={disabled}
          placeholder="cth: POS-KAYA-SET"
          onChange={(e) =>
            setForm({ ...form, sku: e.target.value.toUpperCase() })
          }
        />
      </div>
      <div className="space-y-1.5">
        <Label>Nama Produk POS</Label>
        <Input
          value={form.name}
          disabled={disabled}
          placeholder="cth: Roti Kaya - 3 pcs"
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Menu / Kategori</Label>
        <Select
          value={form.category}
          disabled={disabled}
          onValueChange={(value) =>
            value && setForm({ ...form, category: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POS_MENU_CATEGORIES.map((cat) => (
              <SelectItem key={cat} value={cat}>
                {cat}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-[1fr_120px] gap-3">
        <div className="space-y-1.5">
          <Label>Harga Jualan (RM)</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.price}
            disabled={disabled}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Unit</Label>
          <Input
            value={form.sale_unit}
            disabled={disabled}
            placeholder="Pcs"
            onChange={(e) => setForm({ ...form, sale_unit: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select
          value={form.status}
          disabled={disabled}
          onValueChange={(value) =>
            value && setForm({ ...form, status: value })
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PRODUCT_STATUS.map((status) => (
              <SelectItem key={status} value={status}>
                {status === "ACTIVE" ? "Aktif di POS" : "Tidak aktif"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Susunan Paparan POS</Label>
        <Input
          type="number"
          min="0"
          value={form.sort_order}
          disabled={disabled}
          onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
        />
      </div>
      <div className="space-y-1.5 md:col-span-2">
        <Label>Nota Operasi</Label>
        <Input
          value={form.notes}
          disabled={disabled}
          placeholder="Contoh: perlu BOM stok kaya/butter untuk auto tolakan"
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </div>
  );
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
  const [dialogMode, setDialogMode] = useState<"add" | "edit" | null>(null);
  const [editingProduct, setEditingProduct] = useState<SettingsProduct | null>(
    null,
  );
  const [form, setForm] = useState<ProductFormState>(newProductForm());
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL_CATEGORIES);

  const activeCount = products.filter((p) => p.status === "ACTIVE").length;
  const pelbagaiCount = products.filter(
    (p) => p.category === "Pelbagai",
  ).length;
  const avgPrice =
    products.length > 0
      ? products.reduce((sum, p) => sum + Number(p.selling_price ?? 0), 0) /
        products.length
      : 0;

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const categoryMatch =
        categoryFilter === ALL_CATEGORIES ||
        product.category === categoryFilter;
      const textMatch =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.sku.toLowerCase().includes(needle);
      return categoryMatch && textMatch;
    });
  }, [products, query, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, SettingsProduct[]>();
    for (const cat of POS_MENU_CATEGORIES) map.set(cat, []);
    for (const p of filteredProducts) {
      const key =
        p.category &&
        (POS_MENU_CATEGORIES as readonly string[]).includes(p.category)
          ? p.category
          : "Lain-lain";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return [...map.entries()]
      .map(
        ([cat, list]) =>
          [
            cat,
            [...list].sort((a, b) => {
              const sortA = a.sort_order ?? 99;
              const sortB = b.sort_order ?? 99;
              if (sortA !== sortB) return sortA - sortB;
              return a.name.localeCompare(b.name);
            }),
          ] as const,
      )
      .filter(([, list]) => list.length > 0);
  }, [filteredProducts]);

  function openAdd() {
    setForm(newProductForm());
    setEditingProduct(null);
    setDialogMode("add");
  }

  function openEdit(product: SettingsProduct) {
    setForm(formFromProduct(product));
    setEditingProduct(product);
    setDialogMode("edit");
  }

  function closeDialog() {
    if (saving) return;
    setDialogMode(null);
    setEditingProduct(null);
  }

  function validateForm() {
    if (!form.sku.trim() || !form.name.trim()) {
      toast.error("SKU dan nama produk wajib diisi");
      return false;
    }
    if (Number(form.price) < 0) {
      toast.error("Harga produk tidak boleh negatif");
      return false;
    }
    return true;
  }

  async function handleSave() {
    if (!validateForm()) return;
    setSaving(true);
    const payload = {
      sku: form.sku.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      price: Number(form.price) || 0,
      sale_unit: form.sale_unit.trim() || "Pcs",
      status: form.status,
      sort_order: Number(form.sort_order) || 99,
      notes: form.notes.trim() || null,
    };

    try {
      if (dialogMode === "edit" && editingProduct) {
        await updateProduct(editingProduct.id, payload);
        toast.success("Produk dikemaskini");
      } else {
        await createProduct(payload);
        toast.success("Produk ditambah");
      }
      setDialogMode(null);
      setEditingProduct(null);
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal simpan produk");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: SettingsProduct) {
    if (
      !confirm(
        `Padam produk "${product.name}"?\n\nJika produk pernah digunakan dalam jualan, lebih selamat tukar status kepada Tidak aktif.`,
      )
    ) {
      return;
    }
    setDeletingId(product.id);
    try {
      await deleteProduct(product.id);
      toast.success("Produk dipadam");
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal padam produk");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-3">
        <Card className="overflow-hidden border-amber-200 bg-amber-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-amber-900">
              <PackageCheck className="h-4 w-4" /> Produk POS aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">{activeCount}</p>
            <p className="text-xs text-amber-900/70">
              Dipaparkan di kaunter POS
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-violet-200 bg-violet-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-violet-900">
              <Tags className="h-4 w-4" /> Produk Pelbagai
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {pelbagaiCount}
            </p>
            <p className="text-xs text-violet-900/70">
              Perlu BOM jika mahu auto tolak stok
            </p>
          </CardContent>
        </Card>
        <Card className="overflow-hidden border-emerald-200 bg-emerald-50/70">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm text-emerald-900">
              <SlidersHorizontal className="h-4 w-4" /> Harga purata
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold tabular-nums">
              {fmt(avgPrice)}
            </p>
            <p className="text-xs text-emerald-900/70">
              Rujukan pantas menu semasa
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-amber-100">
        <CardHeader className="gap-3 border-b bg-[linear-gradient(135deg,#fff8e6_0%,#ffffff_55%,#eefcf4_100%)]">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="text-xl">Kawalan Produk POS</CardTitle>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                Tetapkan semua menu jualan dari sini: tambah produk baharu, edit
                harga, susunan paparan, kategori POS, status aktif dan padam
                produk yang tersilap.
              </p>
            </div>
            {isAdmin && (
              <Button
                className="gap-2 bg-amber-500 text-stone-950 hover:bg-amber-400"
                onClick={openAdd}
              >
                <Plus className="h-4 w-4" />
                Tambah Produk
              </Button>
            )}
          </div>
          <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari nama produk atau SKU..."
                className="pl-9"
              />
            </div>
            <Select
              value={categoryFilter}
              onValueChange={(value) => value && setCategoryFilter(value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_CATEGORIES}>Semua kategori</SelectItem>
                {POS_MENU_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4 md:p-5">
          {!isAdmin && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Mode semakan sahaja. Hanya Pentadbir Utama boleh tambah, edit dan
              padam produk.
            </div>
          )}

          {grouped.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="Tiada produk ditemui"
              description="Cuba ubah carian atau kategori. Pentadbir boleh tambah produk POS baharu."
              action={
                isAdmin ? (
                  <Button
                    className="bg-amber-500 text-stone-950 hover:bg-amber-400"
                    onClick={openAdd}
                  >
                    Tambah Produk
                  </Button>
                ) : null
              }
            />
          ) : (
            grouped.map(([cat, list]) => (
              <section key={cat} className="rounded-lg border bg-white">
                <div
                  className={cn(
                    "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3",
                    cat === "Pelbagai"
                      ? "bg-violet-50/80 text-violet-950"
                      : "bg-stone-50/80 text-stone-950",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={categoryBadgeClass(cat)}
                    >
                      {cat}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      {list.length} produk
                    </span>
                  </div>
                  {cat === "Pelbagai" && (
                    <p className="text-xs text-violet-900/70">
                      Semak formula BOM supaya tolakan stok kaya, butter dan
                      packaging tepat.
                    </p>
                  )}
                </div>
                <div className="divide-y">
                  {list.map((product) => (
                    <div
                      key={product.id}
                      className="grid gap-3 px-4 py-3 text-sm transition-colors hover:bg-amber-50/30 lg:grid-cols-[minmax(220px,1fr)_140px_110px_120px_auto]"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-stone-950">
                            {product.name}
                          </p>
                          <Badge
                            variant="outline"
                            className={statusBadgeClass(product.status)}
                          >
                            {product.status === "ACTIVE"
                              ? "Aktif"
                              : "Tidak aktif"}
                          </Badge>
                        </div>
                        <p className="font-mono text-xs text-muted-foreground">
                          {product.sku}
                        </p>
                        {product.notes ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {product.notes}
                          </p>
                        ) : null}
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Harga</p>
                        <p className="font-semibold tabular-nums">
                          {fmt(product.selling_price)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Unit</p>
                        <p className="font-medium">
                          {product.sale_unit || "Pcs"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Susunan</p>
                        <p className="font-medium tabular-nums">
                          {product.sort_order ?? 99}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => openEdit(product)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={deletingId === product.id}
                            className="h-9 w-9 text-destructive hover:text-destructive"
                            onClick={() => handleDelete(product)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog
        open={dialogMode !== null}
        onOpenChange={(open) => (!open ? closeDialog() : null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit" ? "Edit Produk POS" : "Tambah Produk POS"}
            </DialogTitle>
            <DialogDescription>
              Perubahan ini akan digunakan oleh POS selepas halaman dimuat
              semula. Untuk produk yang pernah dijual, lebih selamat tukar
              status kepada tidak aktif berbanding padam.
            </DialogDescription>
          </DialogHeader>
          <ProductFormFields form={form} setForm={setForm} disabled={saving} />
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} disabled={saving}>
              Batal
            </Button>
            <Button
              className="bg-amber-500 text-stone-950 hover:bg-amber-400"
              disabled={saving}
              onClick={handleSave}
            >
              {saving
                ? "Menyimpan..."
                : dialogMode === "edit"
                  ? "Simpan Kemaskini"
                  : "Simpan Produk"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
