'use client';

import { useMemo } from 'react';
import { PackageSearch, Search, X } from 'lucide-react';
import { usePosStore } from '@/stores/pos-store';
import { formatRM, normalizePosCategory, formatKioskStockLabel } from '@/lib/pos/utils';
import { KioskStockBar } from '@/components/pos/kiosk-stock-bar';
import { PelbagaiProductGrid } from '@/components/pos/pelbagai-product-grid';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

function StockBadge({ status, available }: { status?: string; available?: number }) {
 if (available == null) {
 return (
 <Badge variant="outline" className="text-[10px] text-muted-foreground">
 Baki - 
 </Badge>);
 }
 if (status === 'OUT') {
 return (
 <Badge variant="destructive" className="text-[10px]">
 Baki 0 - Habis
 </Badge>);
 }
 if (status === 'LOW') {
 return (
 <Badge variant="secondary" className="border-orange-300 bg-orange-50 text-[10px] text-orange-800">
 Baki {available}
 </Badge>);
 }
 return (
 <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-[10px] text-emerald-900">
 Baki {available}
 </Badge>);
}

function formatMenuBalance(balance: {
 displayQuantity: number;
 displayUnit: string;
 displayBags?: number;
 displayRemainderPcs?: number;
 packQuantity?: number;
 itemCode?: string;
}) {
 return formatKioskStockLabel(balance);
}

export function ProductGrid() {
 const categories = usePosStore((s) => s.categories);
 const selectedCategory = usePosStore((s) => s.selectedCategory);
 const products = usePosStore((s) => s.products);
 const searchQuery = usePosStore((s) => s.searchQuery);
 const stockByProduct = usePosStore((s) => s.stockByProduct);
 const menuStockByCategory = usePosStore((s) => s.menuStockByCategory);
 const setSearchQuery = usePosStore((s) => s.setSearchQuery);
 const setSelectedCategory = usePosStore((s) => s.setSelectedCategory);
 const addToCart = usePosStore((s) => s.addToCart);
 const shift = usePosStore((s) => s.shift);

 const filteredProducts = useMemo(() => {
 let list = products;
 if (selectedCategory) {
 list = list.filter(
 (p) => normalizePosCategory(p.category) === selectedCategory);
 }
 const q = searchQuery.trim().toLowerCase();
 if (q) {
 list = list.filter(
 (p) =>
 p.name.toLowerCase().includes(q) ||
 p.sku.toLowerCase().includes(q));
 }
 return list;
 }, [products, selectedCategory, searchQuery]);

 const hasSearch = searchQuery.trim().length > 0;
 const hasCategoryFilter = Boolean(selectedCategory);
 const hasAnyProducts = products.length > 0;

 return (
 <div className="rkj-surface flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-lg p-3">
 <div className="relative shrink-0">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 placeholder="Cari roti atau SKU..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-11 rounded-lg border-amber-200/70 bg-white pl-9 pr-10 text-base shadow-sm"
 />
 {hasSearch && (
 <button
 type="button"
 aria-label="Kosongkan carian produk"
 onClick={() => setSearchQuery('')}
 className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-amber-100 hover:text-foreground"
 >
 <X className="h-4 w-4" />
 </button>)}
 </div>

 <ScrollArea className="min-h-0 flex-1">
 <div className="space-y-3 pr-3 pb-1">
 <KioskStockBar />

 <div className="flex flex-wrap gap-2">
 {categories.map((cat) => {
 const menuBalance = menuStockByCategory[cat];
 const isPelbagai = cat === 'Pelbagai';
 return (
 <button
 key={cat}
 type="button"
 onClick={() => setSelectedCategory(cat)}
 className={cn(
 'rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors',
 selectedCategory === cat
 ? isPelbagai
 ? 'border-violet-600 bg-violet-600 text-white'
 : 'border-amber-400 bg-amber-400 text-stone-950'
 : 'bg-white hover:bg-amber-50',
 !isPelbagai &&
 menuBalance?.status === 'OUT' &&
 selectedCategory !== cat &&
 'border-destructive/50',
 !isPelbagai &&
 menuBalance?.status === 'LOW' &&
 selectedCategory !== cat &&
 'border-orange-300',
 isPelbagai &&
 selectedCategory !== cat &&
 'border-violet-200')}
 >
 <span>{cat}</span>
 {menuBalance && (
 <span
 className={cn(
 'ml-1.5 text-xs tabular-nums opacity-90',
 selectedCategory === cat
 ? isPelbagai
 ? 'text-white/90'
 : 'text-primary-foreground/90'
 : 'text-muted-foreground')}
 >
 - {formatMenuBalance(menuBalance)}
 </span>)}
 </button>);
 })}
 </div>

 {!shift && (
 <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm font-medium text-amber-900">
 Buka syif dahulu untuk mula jual
 </div>)}

 {!hasAnyProducts ? (
 <div className="flex min-h-[18rem] flex-col items-center justify-center rounded-lg border border-dashed bg-white px-4 py-10 text-center">
 <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
 <PackageSearch className="h-7 w-7" />
 </div>
 <p className="text-sm font-semibold text-foreground">Produk POS belum tersedia</p>
 <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
 Semak cawangan, stok kiosk, atau refresh selepas HQ aktifkan produk untuk cawangan ini.
 </p>
 </div>) : selectedCategory === 'Pelbagai' ? (
 <PelbagaiProductGrid
 products={filteredProducts}
 stockByProduct={stockByProduct}
 shiftOpen={!!shift}
 onAdd={addToCart}
 />) : (
 <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
 {filteredProducts.map((product) => {
 const stock = stockByProduct[product.id];
 const outOfStock = stock?.status === 'OUT';
 return (
 <button
 key={product.id}
 type="button"
 disabled={!shift || outOfStock}
 onClick={() => addToCart(product)}
 className={cn(
 'flex min-h-[116px] flex-col justify-between rounded-lg border bg-white p-3 text-left shadow-sm transition-all',
 'hover:border-amber-400 hover:bg-amber-50/30 hover:shadow-md active:scale-[0.98]',
 'disabled:cursor-not-allowed disabled:opacity-45',
 outOfStock && 'border-dashed opacity-50')}
 >
 <div className="flex w-full items-start justify-between gap-1">
 <span className="line-clamp-2 text-sm font-semibold leading-snug">
 {product.name}
 </span>
 <StockBadge
 status={stock?.status}
 available={stock?.available}
 />
 </div>
 <div className="mt-2 flex w-full items-end justify-between gap-1">
 <span className="text-xl font-bold tabular-nums text-foreground">
 {formatRM(product.price)}
 {product.sale_unit && (
 <span className="ml-1 text-xs font-normal text-muted-foreground">
 / {product.sale_unit}
 </span>)}
 </span>
 </div>
 </button>);
 })}
 </div>)}

 {hasAnyProducts && filteredProducts.length === 0 && (
 <div className="flex min-h-[14rem] flex-col items-center justify-center rounded-lg border border-dashed bg-white px-4 py-8 text-center">
 <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-muted-foreground">
 <Search className="h-6 w-6" />
 </div>
 <p className="text-sm font-semibold text-foreground">Tiada produk dijumpai</p>
 <p className="mt-1 max-w-sm text-xs leading-relaxed text-muted-foreground">
 {hasSearch || hasCategoryFilter
 ? 'Cuba kosongkan carian atau pilih kategori lain.'
 : 'Produk tidak tersedia untuk pilihan semasa.'}
 </p>
 {(hasSearch || hasCategoryFilter) && (
 <div className="mt-3 flex flex-wrap justify-center gap-2">
 {hasSearch && (
 <button
 type="button"
 onClick={() => setSearchQuery('')}
 className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
 >
 Kosongkan carian
 </button>)}
 {hasCategoryFilter && (
 <button
 type="button"
 onClick={() => setSelectedCategory('')}
 className="rounded-md border px-3 py-1.5 text-xs font-medium hover:bg-muted"
 >
 Semua kategori
 </button>)}
 </div>)}
 </div>)}

 <p className="text-[11px] text-muted-foreground">
 Baki stok kiosk dikemas kini setiap muat semula - ditolak automatik selepas jualan
 </p>
 </div>
 </ScrollArea>
 </div>);
}
