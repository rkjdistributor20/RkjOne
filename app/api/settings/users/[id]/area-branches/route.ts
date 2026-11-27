import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createClient } from '@/lib/supabase/server';
import { callRpc } from '@/lib/supabase/rpc';

const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const noStore = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
 const actor = await getCurrentProfile();
 if (actor?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Akses ditolak' }, { status: actor ? 403 : 401 });
 const { id } = await params;
 if (!UUID.test(id)) return NextResponse.json({ error: 'ID AM tidak sah' }, { status: 400 });
 const db = await createClient();
 const { data: am, error } = await db.from('profiles').select('id')
  .eq('id', id).eq('organization_id', actor.organization_id).eq('role', 'AREA_MANAGER').maybeSingle();
 if (error) return NextResponse.json({ error: 'Skop AM tidak dapat disahkan' }, { status: 500 });
 if (!am) return NextResponse.json({ error: 'Akaun AM tidak dijumpai' }, { status: 404 });
 const grants = await db.from('profile_branch_access').select('branch_id').eq('profile_id', id);
 if (grants.error) return NextResponse.json({ error: 'Senarai cawangan tidak dapat dimuatkan' }, { status: 500 });
 return NextResponse.json({ branch_ids: (grants.data ?? []).map(row => row.branch_id) }, { headers: noStore });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
 const actor = await getCurrentProfile();
 if (actor?.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Akses ditolak' }, { status: actor ? 403 : 401 });
 const { id } = await params;
 const body = await request.json().catch(() => null);
 if (!UUID.test(id) || !Array.isArray(body?.branch_ids) || body.branch_ids.length > 100
  || !body.branch_ids.every((value: unknown) => typeof value === 'string' && UUID.test(value))) {
  return NextResponse.json({ error: 'Senarai ID cawangan tidak sah' }, { status: 400 });
 }
 const db = await createClient();
 const { data, error } = await callRpc(db, 'replace_area_manager_branch_grants', { p_profile_id: id, p_branch_ids: body.branch_ids });
 if (error) return NextResponse.json({ error: error.code === '42501' ? 'Cawangan di luar organisasi atau tidak aktif' : 'Senarai cawangan tidak dapat disimpan' }, { status: error.code === '42501' ? 403 : 400 });
 return NextResponse.json(data, { headers: noStore });
}
