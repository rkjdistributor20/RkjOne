import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/session";
import { assertSettingsAdmin } from "@/lib/settings/admin-auth";

const PRODUCT_SELECT =
  "id, sku, name, price, status, category, sale_unit, sort_order, notes";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = assertSettingsAdmin(await getCurrentProfile());
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const name = String(body.name ?? "").trim();
      if (!name)
        return NextResponse.json(
          { error: "Nama produk diperlukan" },
          { status: 400 },
        );
      updates.name = name;
    }
    if (body.sku !== undefined) {
      const sku = String(body.sku ?? "")
        .trim()
        .toUpperCase();
      if (!sku)
        return NextResponse.json(
          { error: "SKU produk diperlukan" },
          { status: 400 },
        );
      updates.sku = sku;
    }
    if (body.category !== undefined) updates.category = body.category || null;
    if (body.price !== undefined) updates.price = Number(body.price);
    if (body.status !== undefined) updates.status = body.status;
    if (body.sale_unit !== undefined)
      updates.sale_unit = body.sale_unit || null;
    if (body.sort_order !== undefined)
      updates.sort_order = Number(body.sort_order ?? 99);
    if (body.notes !== undefined) updates.notes = body.notes || null;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await (supabase as SupabaseClient)
      .from("products")
      .update(updates)
      .eq("id", id)
      .eq("organization_id", profile.organization_id)
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

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const profile = assertSettingsAdmin(await getCurrentProfile());
    const { id } = await params;
    const supabase = await createClient();

    const { error } = await (supabase as SupabaseClient)
      .from("products")
      .delete()
      .eq("id", id)
      .eq("organization_id", profile.organization_id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: { id, deleted: true } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Forbidden" },
      { status: 403 },
    );
  }
}
