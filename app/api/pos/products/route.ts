import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { normalizePosCategory, parsePrice, POS_MENU_CATEGORIES } from '@/lib/pos/utils';
import type { Product } from '@/types/database';

export async function GET(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const branchId = searchParams.get('branch_id') ?? profile.branch_id;

  if (!branchId) {
    return NextResponse.json({ error: 'Branch required' }, { status: 400 });
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE')
    .order('sort_order')
    .order('name');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as Product[];

  const products = rows
    .map((p) => ({
      ...p,
      price: parsePrice(p.price),
      category: normalizePosCategory(p.category),
    }))
    .filter((p) => p.category !== null);

  return NextResponse.json({
    products,
    categories: [...POS_MENU_CATEGORIES],
    branchId,
  });
}
