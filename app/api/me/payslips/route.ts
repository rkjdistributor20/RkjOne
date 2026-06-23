import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { resolveLegalEntityId } from '@/lib/settings/legal-entity';

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
const BUCKET = 'staff-payslips';

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const service = await createServiceClient();
  const { data, error } = await (service as SupabaseClient)
    .from('staff_payslips')
    .select(
      'id, period_label, period_start, period_end, file_name, storage_path, created_at, legal_entity:legal_entities(code, legal_name)'
    )
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: signed } = await service.storage
        .from(BUCKET)
        .createSignedUrl(row.storage_path as string, 3600);
      const entity = Array.isArray(row.legal_entity) ? row.legal_entity[0] : row.legal_entity;
      return {
        id: row.id,
        period_label: row.period_label,
        period_start: row.period_start,
        period_end: row.period_end,
        file_name: row.file_name,
        legal_entity_code: entity?.code ?? null,
        legal_entity_name: entity?.legal_name ?? null,
        created_at: row.created_at,
        download_url: signed?.signedUrl ?? null,
      };
    })
  );

  return NextResponse.json({ payslips: rows });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await request.formData();
  const file = form.get('file');
  const periodLabel = String(form.get('period_label') ?? '').trim();
  const periodStart = String(form.get('period_start') ?? '').trim() || null;
  const periodEnd = String(form.get('period_end') ?? '').trim() || null;
  const legalEntityCode = String(form.get('legal_entity_code') ?? '').trim() || null;
  const staffId = String(form.get('staff_id') ?? '').trim() || null;
  const notes = String(form.get('notes') ?? '').trim() || null;

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Fail slip gaji diperlukan' }, { status: 400 });
  }
  if (!periodLabel) {
    return NextResponse.json({ error: 'Label tempoh diperlukan (cth. Mac 2025)' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'PDF, JPG, PNG atau WebP sahaja' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Saiz fail maksimum 10 MB' }, { status: 400 });
  }

  const supabase = await createClient();
  const service = await createServiceClient();

  if (staffId) {
    const { data: staffRow } = await service
      .from('staff')
      .select('id, profile_id')
      .eq('id', staffId)
      .eq('profile_id', profile.id)
      .maybeSingle();
    if (!staffRow) {
      return NextResponse.json({ error: 'Rekod staf tidak sah' }, { status: 400 });
    }
  }

  let legalEntityId: string | null = null;
  if (legalEntityCode) {
    legalEntityId = await resolveLegalEntityId(supabase, profile.organization_id, legalEntityCode);
  }

  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  const objectPath = `${profile.id}/${Date.now()}-${periodLabel.replace(/[^a-zA-Z0-9-_]/g, '_')}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadErr } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
    upsert: false,
    contentType: file.type,
  });

  if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 400 });

  const { data: inserted, error: insertErr } = await (service as SupabaseClient)
    .from('staff_payslips')
    .insert({
      organization_id: profile.organization_id,
      profile_id: profile.id,
      staff_id: staffId,
      legal_entity_id: legalEntityId,
      period_label: periodLabel,
      period_start: periodStart,
      period_end: periodEnd,
      file_name: file.name,
      storage_path: objectPath,
      mime_type: file.type,
      file_size: file.size,
      notes,
      uploaded_by: profile.id,
    })
    .select('id')
    .single();

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 400 });

  const { data: signed } = await service.storage.from(BUCKET).createSignedUrl(objectPath, 3600);

  return NextResponse.json({
    payslip: {
      id: inserted.id,
      period_label: periodLabel,
      download_url: signed?.signedUrl ?? null,
    },
  });
}
