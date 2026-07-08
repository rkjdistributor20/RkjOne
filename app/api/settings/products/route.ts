import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { assertSettingsAdmin } from "@/lib/settings/admin-auth";

const PRODUCT_SELECT =
  "id, sku, name, price, status, category, sale_unit, sort_order, notes";

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("organization_id", profile.organization_id)
    .order("sort_order")
    .order("name");

  if (error)
    return NextResponse.json({ error: error.message }, { status: 500 });

  const products = (
    (data ?? []) as Array<{
      id: string;
      sku: string;
      name: string;
      price: number;
      status: string;
      category: string | null;
      sale_unit: string | null;
      sort_order: number | null;
      notes: string | null;
    }>
  ).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    status: p.status,
    category: p.category,
    selling_price: Number(p.price ?? 0),
    sale_unit: p.sale_unit,
    sort_order: p.sort_order,
    notes: p.notes,
  }));

  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  try {
    const profile = assertSettingsAdmin(await getCurrentProfile());
    const body = await request.json();
    const supabase = await createClient();
    const sku = String(body.sku ?? "")
      .trim()
      .toUpperCase();
    const name = String(body.name ?? "").trim();

    if (!sku || !name) {
      return NextResponse.json(
        { error: "SKU dan nama produk diperlukan" },
        { status: 400 },
      );
    }

    const { data, error } = await (supabase as SupabaseClient)
      .from("products")
      .insert({
        organization_id: profile.organization_id,
        sku,
        name,
        category: body.category ?? null,
        price: Number(body.price ?? 0),
        sale_unit: body.sale_unit ?? "Pcs",
        status: body.status ?? "ACTIVE",
        sort_order: Number(body.sort_order ?? 99),
        notes: body.notes ?? null,
      })
      .select(PRODUCT_SELECT)
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });

    return NextResponse.json({
      product: { ...data, selling_price: Number(data.price ?? 0) },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Forbidden" },
      { status: 403 },
    );
  }
}
