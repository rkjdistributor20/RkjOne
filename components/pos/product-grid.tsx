'use client';

import { useMemo } from 'react';
import { Search } from 'lucide-react';
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

 return (
 <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden rounded-xl border bg-card p-3">
 <div className="relative shrink-0">
 <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
 <Input
 placeholder="Cari roti atau SKU..."
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 className="h-11 pl-9 text-base"
 />
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
 'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
 selectedCategory === cat
 ? isPelbagai
 ? 'border-violet-600 bg-violet-600 text-white'
 : 'border-primary bg-primary text-primary-foreground'
 : 'bg-background hover:bg-muted',
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
 <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-center text-sm text-amber-900">
 Buka syif dahulu untuk mula jual
 </div>)}

 {selectedCategory === 'Pelbagai' ? (
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
 'flex min-h-[116px] flex-col justify-between rounded-xl border-2 bg-background p-3 text-left transition-all',
 'hover:border-primary hover:shadow-md active:scale-[0.97]',
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

 {filteredProducts.length === 0 && (
 <p className="py-12 text-center text-sm text-muted-foreground">
 Tiada produk dijumpai
 </p>)}

 <p className="text-[11px] text-muted-foreground">
 Baki stok kiosk dikemas kini setiap muat semula - ditolak automatik selepas jualan
 </p>
 </div>
 </ScrollArea>
 </div>);
}
