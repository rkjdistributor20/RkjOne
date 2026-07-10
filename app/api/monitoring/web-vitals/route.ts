import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';

type PerformanceWebVitalsInsert = {
 organization_id: string;
 profile_id: string;
 route: string;
 metric_name: string;
 metric_value: number;
 metric_delta: number | null;
 metric_rating: 'good' | 'needs-improvement' | 'poor' | null;
 navigation_type: string | null;
 connection_type: string | null;
 device_memory: number | null;
 user_agent: string | null;
};

type PerformanceWebVitalsClient = {
 from: (table: 'performance_web_vitals') => {
  insert: (row: PerformanceWebVitalsInsert) => Promise<{ error: { message: string } | null }>;
 };
};

function cleanText(value: unknown, maxLength: number) {
 if (typeof value !== 'string') return null;
 const cleaned = value.trim().slice(0, maxLength);
 return cleaned.length > 0 ? cleaned : null;
}

function cleanRoute(value: unknown) {
 const route = cleanText(value, 180);
 if (!route || !route.startsWith('/')) return null;
 return route.split('?')[0]?.slice(0, 180) ?? '/';
}

function cleanNumber(value: unknown) {
 const number = Number(value);
 return Number.isFinite(number) ? number : null;
}

function cleanRating(value: unknown) {
 if (value === 'good' || value === 'needs-improvement' || value === 'poor') {
  return value;
 }
 return null;
}

export async function POST(request: Request) {
 const profile = await getCurrentProfile();
 if (!profile) {
  return new NextResponse(null, { status: 204 });
 }

 const body = await request.json().catch(() => null);
 if (!body || typeof body !== 'object') {
  return NextResponse.json({ error: 'Invalid performance metric' }, { status: 400 });
 }

 const metric = body as Record<string, unknown>;
 const route = cleanRoute(metric.route);
 const metricName = cleanText(metric.name, 48);
 const metricValue = cleanNumber(metric.value);

 if (!route || !metricName || metricValue === null) {
  return NextResponse.json({ error: 'Invalid performance metric' }, { status: 400 });
 }

 const supabase = await createClient();
 const { error } = await (supabase as unknown as PerformanceWebVitalsClient)
 .from('performance_web_vitals')
 .insert({
  organization_id: profile.organization_id,
  profile_id: profile.id,
  route,
  metric_name: metricName,
  metric_value: metricValue,
  metric_delta: cleanNumber(metric.delta),
  metric_rating: cleanRating(metric.rating),
  navigation_type: cleanText(metric.navigationType, 48),
  connection_type: cleanText(metric.connectionType, 48),
  device_memory: cleanNumber(metric.deviceMemory),
  user_agent: cleanText(request.headers.get('user-agent'), 180),
 });

 if (error) {
  console.error('[performance_web_vitals]', error.message);
  return NextResponse.json({ accepted: false }, { status: 202 });
 }

 return new NextResponse(null, { status: 204 });
}
