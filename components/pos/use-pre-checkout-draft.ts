'use client';

import { useCallback, useLayoutEffect } from 'react';
import { usePosStore } from '@/stores/pos-store';
import { readPosPreCheckoutDraft, retirePosPreCheckoutDraft, writePosPreCheckoutDraft } from '@/lib/pos/pre-checkout-draft';

// One official POS, one cart within this webview. Keep the checkout exclusion
// through component remounts along with the in-memory Zustand cart.
let lastBoundKey: string | null = null;
let checkoutCartId: string | null = null;
let knownDraft: { key: string; cartSessionId: string } | null = null;

export function usePreCheckoutDraft(key: string | null, catalogReady: boolean) {
 useLayoutEffect(() => {
  if (!key) return;
  const store = usePosStore.getState();
  if (lastBoundKey && lastBoundKey !== key && store.cart.length > 0) {
   store.clearCart();
  }
  lastBoundKey = key;
  if (catalogReady && !usePosStore.getState().cart.length) {
   try {
    const saved = readPosPreCheckoutDraft(window.localStorage, key, store.products);
    if (saved) {
     knownDraft = { key, cartSessionId: saved.cartSessionId };
     usePosStore.setState(saved);
    }
   } catch {
    // Storage may be unavailable in this webview; no draft can be restored.
   }
  }

  return usePosStore.subscribe((next, previous) => {
   if (next.cart === previous.cart && next.cartSessionId === previous.cartSessionId) return;
   // Hydration/cleanup must never write a cart that already entered checkout.
   if (next.cartSessionId === checkoutCartId) return;
   try {
    if (!next.cart.length) {
     window.localStorage.removeItem(key);
     if (knownDraft?.key === key) knownDraft = null;
    } else {
     writePosPreCheckoutDraft(window.localStorage, key, next);
     knownDraft = { key, cartSessionId: next.cartSessionId };
    }
   } catch {
    // Current cart stays intact in memory. Checkout checks removal separately.
   }
  });
 }, [key, catalogReady]);

 return useCallback(() => {
  const { cartSessionId } = usePosStore.getState();
  // A transient device or shift refresh must not skip retirement of a draft
  // that was saved earlier in this webview.
  const storedKey = knownDraft?.cartSessionId === cartSessionId ? knownDraft.key : key;
  if (!storedKey) return true;
  try {
   // Persisted drafts are only allowed BEFORE the checkout can issue a payment.
   // Do this synchronously for every checkout entry point, including F2.
   retirePosPreCheckoutDraft(window.localStorage, storedKey);
   if (knownDraft?.key === storedKey) knownDraft = null;
   checkoutCartId = cartSessionId;
   return true;
  } catch {
   // If we cannot guarantee that an old snapshot was removed, do not charge.
   return false;
  }
 }, [key]);
}
