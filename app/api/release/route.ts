import { NextResponse } from 'next/server';
import { getReleaseMetadata } from '@/lib/pwa/release-metadata';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
 return NextResponse.json(getReleaseMetadata(), {
  headers: {
   'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
   Pragma: 'no-cache',
   Expires: '0',
  },
 });
}
