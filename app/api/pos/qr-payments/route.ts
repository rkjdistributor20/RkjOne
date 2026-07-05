import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { enforceRateLimit } from '@/lib/security/rate-limit';

export async function POST(request: Request) {
 const limited = enforceRateLimit(request, {
 key: 'pos-qr-payment-create',
 limit: 60,
 windowMs: 60 * 1000,
 });
 if (limited) return limited;

 const profile = await getCurrentProfile();
 if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

 return NextResponse.json(
 {
 error: 'POS QR online belum diaktifkan. Gunakan bayaran QR manual di POS dan sahkan di dashboard Kewangan.',
 mode: 'MANUAL_QR_ONLY',
 },
 { status: 409 });
}
