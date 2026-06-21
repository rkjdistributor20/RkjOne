import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import {
  assertCanManagePersonnel,
  assertStaffTargetInScope,
} from '@/lib/settings/personnel-access';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const profile = assertCanManagePersonnel(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();

    await assertStaffTargetInScope(supabase, profile, id);

    const { count } = await supabase
      .from('staff_shifts')
      .select('id', { count: 'exact', head: true })
      .eq('staff_id', id);

    if ((count ?? 0) > 0) {
      return NextResponse.json(
        {
          error:
            'Staf ada rekod syif — set status INACTIVE atau hubungi Admin HQ',
        },
        { status: 400 }
      );
    }

    const { error } = await (supabase as SupabaseClient)
      .from('staff')
      .delete()
      .eq('id', id)
      .eq('organization_id', profile.organization_id);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Forbidden' },
      { status: 403 }
    );
  }
}
