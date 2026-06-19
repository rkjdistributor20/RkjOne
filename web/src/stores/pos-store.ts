import { create } from 'zustand';
import type { Product } from '@/types/database';
import type {
  CartItem,
  DailySummary,
  PaymentMethod,
  PosShiftSummary,
  PosTransactionRow,
  SaleResult,
} from '@/lib/pos/types';

interface PosState {
  branchId: string | null;
  products: Product[];
  categories: string[];
  selectedCategory: string | null;
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

  cartSubtotal: () => number;
  cartItemCount: () => number;
  filteredProducts: () => Product[];
}

export const usePosStore = create<PosState>((set, get) => ({
  branchId: null,
  products: [],
  categories: [],
  selectedCategory: null,
  cart: [],
  shift: null,
  transactions: [],
  dailySummary: null,
  lastReceipt: null,
  isOnline: true,
  offlineCount: 0,
  isLoading: false,

  setBranchId: (branchId) => set({ branchId }),
  setProducts: (products, categories) =>
    set({ products, categories, selectedCategory: categories[0] ?? null }),
  setSelectedCategory: (selectedCategory) => set({ selectedCategory }),
  addToCart: (product) => {
    const cart = get().cart;
    const existing = cart.find((c) => c.productId === product.id);
    if (existing) {
      set({
        cart: cart.map((c) =>
          c.productId === product.id
            ? { ...c, quantity: c.quantity + 1 }
            : c
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
            price: Number(product.price),
            quantity: 1,
            category: product.category,
          },
        ],
      });
    }
  },
  updateQuantity: (productId, delta) => {
    set({
      cart: get()
        .cart.map((c) =>
          c.productId === productId
            ? { ...c, quantity: c.quantity + delta }
            : c
        )
        .filter((c) => c.quantity > 0),
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
  filteredProducts: () => {
    const { products, selectedCategory } = get();
    if (!selectedCategory) return products;
    return products.filter(
      (p) => (p.category ?? 'Other') === selectedCategory
    );
  },
}));

export type { PaymentMethod };
