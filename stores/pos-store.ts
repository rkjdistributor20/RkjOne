import { create } from 'zustand';
import { toast } from 'sonner';
import { normalizePosCategory, parsePrice, POS_MENU_CATEGORIES } from '@/lib/pos/utils';
import type { Product } from '@/types/database';
import type {
 CartItem,
 DailySummary,
 MenuStockBalance,
 PaymentMethod,
 PosShiftSummary,
 PosTransactionRow,
 ProductStockInfo,
 SaleResult,
} from '@/lib/pos/types';

interface PosState {
 branchId: string | null;
 products: Product[];
 categories: string[];
 selectedCategory: string | null;
 searchQuery: string;
 stockByProduct: Record<string, ProductStockInfo>;
 menuStockByCategory: Record<string, MenuStockBalance>;
 supplementStock: MenuStockBalance[];
 cart: CartItem[];
 shift: PosShiftSummary | null;
 transactions: PosTransactionRow[];
 dailySummary: DailySummary | null;
 lastReceipt: SaleResult | null;
 isOnline: boolean;
 offlineCount: number;
 isLoading: boolean;

 setBranchId: (id: string) => void;
 setProducts: (products: Product[], categories: string[]) => void;
 setStockByProduct: (stock: Record<string, ProductStockInfo>) => void;
 setMenuStockByCategory: (stock: Record<string, MenuStockBalance>) => void;
 setSupplementStock: (stock: MenuStockBalance[]) => void;
 setSearchQuery: (q: string) => void;
 setSelectedCategory: (cat: string | null) => void;
 addToCart: (product: Product) => void;
 updateQuantity: (productId: string, delta: number) => void;
 removeFromCart: (productId: string) => void;
 clearCart: () => void;
 setShift: (shift: PosShiftSummary | null) => void;
 setTransactions: (txs: PosTransactionRow[]) => void;
 setDailySummary: (summary: DailySummary | null) => void;
 setLastReceipt: (receipt: SaleResult | null) => void;
 setOnline: (online: boolean) => void;
 setOfflineCount: (count: number) => void;
 setLoading: (loading: boolean) => void;

 getAvailableQty: (productId: string) => number | null;
 cartSubtotal: () => number;
 cartItemCount: () => number;
}

export const usePosStore = create<PosState>((set, get) => ({
 branchId: null,
 products: [],
 categories: [],
 selectedCategory: null,
 searchQuery: '',
 stockByProduct: {},
 menuStockByCategory: {},
 supplementStock: [],
 cart: [],
 shift: null,
 transactions: [],
 dailySummary: null,
 lastReceipt: null,
 isOnline: true,
 offlineCount: 0,
 isLoading: false,

 setBranchId: (branchId) => set({ branchId }),
 setProducts: (products, _categories) =>
 set({
 products,
 categories: [...POS_MENU_CATEGORIES],
 selectedCategory: POS_MENU_CATEGORIES[0],
 }),
 setStockByProduct: (stockByProduct) => set({ stockByProduct }),
 setMenuStockByCategory: (menuStockByCategory) => set({ menuStockByCategory }),
 setSupplementStock: (supplementStock) => set({ supplementStock }),
 setSearchQuery: (searchQuery) => set({ searchQuery }),
 setSelectedCategory: (selectedCategory) => set({ selectedCategory }),

 getAvailableQty: (productId) => {
 const info = get().stockByProduct[productId];
 return info ? info.available : null;
 },

 addToCart: (product) => {
 const { cart, stockByProduct } = get();
 const unitPrice = parsePrice(product.price);
 if (unitPrice <= 0) {
 toast.error('Harga produk belum diset - hubungi HQ');
 return;
 }
 const stock = stockByProduct[product.id];
 const existing = cart.find((c) => c.productId === product.id);
 const nextQty = (existing?.quantity ?? 0) + 1;

 if (!stock) {
 toast.error('Stok tidak dimuatkan - muat semula halaman');
 return;
 }
 if (stock.available <= 0) {
 toast.error('Stok habis - minta bekalan dari HQ');
 return;
 }
 if (nextQty > stock.available) {
 toast.error(`Stok kiosk tinggal ${stock.available} unit sahaja`);
 return;
 }

 if (existing) {
 set({
 cart: cart.map((c) =>
 c.productId === product.id ? { ...c, quantity: nextQty } : c
 ),
 });
 } else {
 set({
 cart: [
 ...cart,
 {
 productId: product.id,
 sku: product.sku,
 name: product.name,
 price: unitPrice,
 quantity: 1,
 category: product.category,
 },
 ],
 });
 }
 },

 updateQuantity: (productId, delta) => {
 const { cart, stockByProduct } = get();
 const item = cart.find((c) => c.productId === productId);
 if (!item) return;

 const nextQty = item.quantity + delta;
 if (nextQty <= 0) {
 set({ cart: cart.filter((c) => c.productId !== productId) });
 return;
 }

 const stock = stockByProduct[productId];
 if (!stock) {
 toast.error('Stok tidak dimuatkan - muat semula halaman');
 return;
 }
 if (nextQty > stock.available) {
 toast.error(`Stok kiosk tinggal ${stock.available} unit sahaja`);
 return;
 }

 set({
 cart: cart.map((c) =>
 c.productId === productId ? { ...c, quantity: nextQty } : c
 ),
 });
 },

 removeFromCart: (productId) =>
 set({ cart: get().cart.filter((c) => c.productId !== productId) }),
 clearCart: () => set({ cart: [] }),
 setShift: (shift) => set({ shift }),
 setTransactions: (transactions) => set({ transactions }),
 setDailySummary: (dailySummary) => set({ dailySummary }),
 setLastReceipt: (lastReceipt) => set({ lastReceipt }),
 setOnline: (isOnline) => set({ isOnline }),
 setOfflineCount: (offlineCount) => set({ offlineCount }),
 setLoading: (isLoading) => set({ isLoading }),

 cartSubtotal: () =>
 get().cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
 cartItemCount: () =>
 get().cart.reduce((sum, item) => sum + item.quantity, 0),
}));

export type { PaymentMethod };
