'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { ModuleLayout } from '@/components/shared/module-ui';

function CheckoutInner() {
 const searchParams = useSearchParams();
 const paymentId = searchParams.get('payment');
 const [error, setError] = useState<string | null>(null);

 useEffect(() => {
 if (!paymentId) {
 setError('ID pembayaran tiada');
 return;
 }
 void (async () => {
 try {
 const res = await fetch(`/api/sales-agent/payments/${paymentId}/ipay88`);
 const body = await res.json();
 if (!res.ok) throw new Error(body.error ?? 'Gagal sediakan checkout');

 const form = document.createElement('form');
 form.method = 'POST';
 form.action = body.form.action;
 for (const [key, value] of Object.entries(body.form.fields as Record<string, string>)) {
 const input = document.createElement('input');
 input.type = 'hidden';
 input.name = key;
 input.value = value;
 form.appendChild(input);
 }
 document.body.appendChild(form);
 form.submit();
 } catch (e) {
 setError(e instanceof Error ? e.message : 'Checkout gagal');
 }
 })();
 }, [paymentId]);

 return (
 <ModuleLayout>
 <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
 {error ? (
 <>
 <p className="text-destructive">{error}</p>
 <a href="/sales-agent" className="text-sm text-primary underline">
 Kembali ke Portal Ejen
 </a>
 </>) : (
 <>
 <Loader2 className="h-8 w-8 animate-spin text-emerald-700" />
 <p className="text-sm text-muted-foreground">
 Menghubung ke FPX / iPay88 - RKJ Distributor Sdn Bhd...
 </p>
 </>)}
 </div>
 </ModuleLayout>);
}

export default function SalesAgentCheckoutPage() {
 return (
 <Suspense fallback={<p className="p-6 text-sm text-muted-foreground">Menyediakan checkout...</p>}>
 <CheckoutInner />
 </Suspense>);
}
