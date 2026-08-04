import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCanAccessPosBranch, posAccessErrorStatus } from '@/lib/pos/access';

function isAllowedFiuuImageUrl(value: string): boolean {
 try {
  const url = new URL(value);
  return url.protocol === 'https:'
   && (url.hostname === 'fiuu.com' || url.hostname.endsWith('.fiuu.com'));
 } catch {
  return false;
 }
}

export async function GET(
 _request: Request,
 context: { params: Promise<{ paymentId: string }> }) {
 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 const { paymentId } = await context.params;
 const admin = createAdminClient();
 const { data: payment, error } = await admin
  .from('pos_online_payments')
  .select('branch_id, checkout_url, provider')
  .eq('id', paymentId)
  .eq('organization_id', profile.organization_id)
  .eq('provider', 'fiuu')
  .maybeSingle();
 if (error || !payment?.checkout_url) {
  return NextResponse.json({ error: 'Imej QR tidak dijumpai' }, { status: 404 });
 }

 try {
  await assertCanAccessPosBranch(admin, profile, payment.branch_id);
 } catch (accessError) {
  return NextResponse.json(
   { error: accessError instanceof Error ? accessError.message : 'Akses cawangan ditolak' },
   { status: posAccessErrorStatus(accessError) },
  );
 }

 if (!isAllowedFiuuImageUrl(payment.checkout_url)) {
  return NextResponse.json({ error: 'URL imej QR Fiuu tidak sah' }, { status: 400 });
 }

 const response = await fetch(payment.checkout_url, {
  cache: 'no-store',
  signal: AbortSignal.timeout(10_000),
 });
 const contentType = response.headers.get('content-type') ?? '';
 const contentLength = Number(response.headers.get('content-length') ?? 0);
 if (!response.ok || !contentType.startsWith('image/')
  || (contentLength > 0 && contentLength > 2_000_000)) {
  return NextResponse.json({ error: 'Imej QR Fiuu tidak tersedia' }, { status: 502 });
 }
 const image = await response.arrayBuffer();
 if (image.byteLength > 2_000_000) {
  return NextResponse.json({ error: 'Imej QR Fiuu terlalu besar' }, { status: 502 });
 }

 return new NextResponse(image, {
  status: 200,
  headers: {
   'Content-Type': contentType,
   'Cache-Control': 'private, no-store, max-age=0',
   'X-Content-Type-Options': 'nosniff',
  },
 });
}
