import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { createEnrollmentCode, hashPosDeviceValue } from '@/lib/pos/device-auth';
import { isOfficialHardwareProfile } from '@/lib/pos/official-tablets';

function normalizeSerial(value: unknown) {
  return String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
}

function normalizeImei(value: unknown) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeDate(value: unknown) {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function isAdmin(role?: string | null) {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}

export async function GET() {
  const profile = await getCurrentProfile();
  if (!profile || !isAdmin(profile.role)) {
    return NextResponse.json({ error: 'Akses pentadbir diperlukan.' }, { status: 403 });
  }
  const admin = createAdminClient();
  const [{ data: devices, error }, { data: branches }] = await Promise.all([
    (admin as any)
      .from('pos_devices')
      .select('id, branch_id, device_code, device_name, status, enrollment_code_hash, enrollment_expires_at, enrolled_at, last_seen_at, revoked_at, created_at, metadata, serial_number, imei, purchase_date, warranty_expires_at, asset_verified_at, asset_verified_by, branch:branches(branch_code, branch_name)')
      .eq('organization_id', profile.organization_id)
      .order('created_at', { ascending: false }),
    admin
      .from('branches')
      .select('id, branch_code, branch_name, status')
      .eq('organization_id', profile.organization_id)
      .eq('status', 'ACTIVE')
      .order('branch_code'),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    devices: (devices ?? []).map((device: any) => ({
      ...device,
      management: device.metadata?.device_management ?? null,
      hardware_profile: device.metadata?.official_hardware_profile ?? null,
      enrollment_ready: Boolean(device.enrollment_code_hash),
      enrollment_code_hash: undefined,
      metadata: undefined,
    })),
    branches: branches ?? [],
  });
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !isAdmin(profile.role)) {
    return NextResponse.json({ error: 'Akses pentadbir diperlukan.' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? 'generate_code');
  const admin = createAdminClient();

  if (action === 'prepare_all') {
    const [{ data: branches, error: branchError }, { data: currentDevices, error: deviceError }] = await Promise.all([
      (admin as any)
        .from('branches')
        .select('id, branch_code, branch_name')
        .eq('organization_id', profile.organization_id)
        .eq('status', 'ACTIVE')
        .order('branch_code'),
      (admin as any)
        .from('pos_devices')
        .select('branch_id')
        .eq('organization_id', profile.organization_id)
        .in('status', ['PENDING', 'ACTIVE']),
    ]);
    if (branchError || deviceError) {
      return NextResponse.json({ error: branchError?.message ?? deviceError?.message }, { status: 500 });
    }

    const preparedBranches = new Set((currentDevices ?? []).map((device: any) => device.branch_id));
    const missing = (branches ?? []).filter((branch: any) => !preparedBranches.has(branch.id));
    if (missing.length === 0) {
      return NextResponse.json({ created: 0, total: branches?.length ?? 0 });
    }

    const rows = missing.map((branch: any) => ({
      organization_id: profile.organization_id,
      branch_id: branch.id,
      device_code: `POS-${branch.branch_code}-${branch.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`,
      device_name: `Tablet POS - ${branch.branch_name}`.slice(0, 80),
      status: 'PENDING',
      created_by: profile.id,
    }));
    const { error: insertError } = await (admin as any).from('pos_devices').insert(rows);
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 400 });
    return NextResponse.json({ created: rows.length, total: branches?.length ?? 0 }, { status: 201 });
  }

  if (!['generate_code', 'save_asset'].includes(action)) {
    return NextResponse.json({ error: 'Tindakan pendaftaran tablet tidak sah.' }, { status: 400 });
  }

  const branchId = String(body.branch_id ?? '');
  const deviceName = String(body.device_name ?? '').trim();
  const hardwareProfile = isOfficialHardwareProfile(body.hardware_profile) ? body.hardware_profile : null;
  const serialNumber = normalizeSerial(body.serial_number);
  const imei = normalizeImei(body.imei);
  const purchaseDate = normalizeDate(body.purchase_date);
  const warrantyExpiresAt = normalizeDate(body.warranty_expires_at);
  if (!branchId || deviceName.length < 3 || deviceName.length > 80) {
    return NextResponse.json({ error: 'Pilih cawangan dan masukkan nama tablet yang jelas.' }, { status: 400 });
  }
  if (!hardwareProfile) {
    return NextResponse.json({ error: 'Pilih model tablet rasmi.' }, { status: 400 });
  }
  if (serialNumber.length < 5 || serialNumber.length > 64) {
    return NextResponse.json({ error: 'Masukkan nombor siri tablet yang sah.' }, { status: 400 });
  }
  if (!/^\d{15}$/.test(imei)) {
    return NextResponse.json({ error: 'IMEI mesti mengandungi tepat 15 digit.' }, { status: 400 });
  }
  if (purchaseDate && warrantyExpiresAt && warrantyExpiresAt < purchaseDate) {
    return NextResponse.json({ error: 'Tarikh tamat waranti tidak boleh lebih awal daripada tarikh pembelian.' }, { status: 400 });
  }
  const { data: branch } = await (admin as any)
    .from('branches')
    .select('id, branch_code')
    .eq('id', branchId)
    .eq('organization_id', profile.organization_id)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (!branch) return NextResponse.json({ error: 'Cawangan aktif tidak dijumpai.' }, { status: 404 });

  const { data: active } = await (admin as any)
    .from('pos_devices')
    .select('id')
    .eq('branch_id', branchId)
    .eq('status', 'ACTIVE')
    .maybeSingle();
  if (active) {
    return NextResponse.json({ error: 'Cawangan ini sudah mempunyai tablet rasmi aktif.' }, { status: 409 });
  }

  const { data: pending } = await (admin as any)
    .from('pos_devices')
    .select('id, device_code, metadata')
    .eq('branch_id', branchId)
    .eq('status', 'PENDING')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const saveOnly = action === 'save_asset';
  const enrollmentCode = saveOnly ? null : createEnrollmentCode();
  const expiresAt = saveOnly ? null : new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const suffix = enrollmentCode?.slice(-4) ?? serialNumber.slice(-6);
  const assetFields = {
    device_name: deviceName,
    serial_number: serialNumber,
    imei,
    purchase_date: purchaseDate,
    warranty_expires_at: warrantyExpiresAt,
    asset_verified_at: new Date().toISOString(),
    asset_verified_by: profile.id,
  };
  const enrollmentFields = enrollmentCode
    ? {
        enrollment_code_hash: hashPosDeviceValue(enrollmentCode),
        enrollment_expires_at: expiresAt,
      }
    : {
        enrollment_code_hash: null,
        enrollment_expires_at: null,
      };
  const mutation = pending
    ? (admin as any)
      .from('pos_devices')
      .update({
        ...assetFields,
        ...enrollmentFields,
        metadata: {
          ...(pending.metadata && typeof pending.metadata === 'object' ? pending.metadata : {}),
          official_hardware_profile: hardwareProfile,
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', pending.id)
    : (admin as any)
      .from('pos_devices')
      .insert({
        organization_id: profile.organization_id,
        branch_id: branchId,
        device_code: `POS-${branch.branch_code}-${suffix}`,
        ...assetFields,
        status: 'PENDING',
        enrollment_code_hash: enrollmentCode ? hashPosDeviceValue(enrollmentCode) : null,
        enrollment_expires_at: expiresAt,
        metadata: { official_hardware_profile: hardwareProfile },
        created_by: profile.id,
      });
  const { data: device, error } = await mutation
    .select('id, device_code, device_name, branch_id, status, enrollment_expires_at, serial_number, imei, asset_verified_at')
    .single();
  if (error) {
    const duplicate = error.code === '23505';
    return NextResponse.json({ error: duplicate ? 'Nombor siri atau IMEI sudah didaftarkan pada tablet lain.' : error.message }, { status: 400 });
  }
  return NextResponse.json({ device, enrollment_code: enrollmentCode, asset_saved: true }, { status: 201 });
}

export async function PATCH(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !isAdmin(profile.role)) {
    return NextResponse.json({ error: 'Akses pentadbir diperlukan.' }, { status: 403 });
  }
  const body = await request.json().catch(() => ({}));
  const deviceId = String(body.device_id ?? '');
  const action = String(body.action ?? 'revoke');
  if (!deviceId) return NextResponse.json({ error: 'device_id diperlukan.' }, { status: 400 });
  if (!['revoke', 'reactivate'].includes(action)) {
    return NextResponse.json({ error: 'Tindakan tablet tidak sah.' }, { status: 400 });
  }
  const admin = createAdminClient();
  const now = new Date().toISOString();

  if (action === 'reactivate') {
    const { data: device, error: lookupError } = await (admin as any)
      .from('pos_devices')
      .select('id, branch_id, status')
      .eq('id', deviceId)
      .eq('organization_id', profile.organization_id)
      .maybeSingle();
    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 400 });
    if (!device) return NextResponse.json({ error: 'Rekod tablet tidak dijumpai.' }, { status: 404 });
    if (device.status !== 'REVOKED') {
      return NextResponse.json({ error: 'Hanya tablet yang dibatalkan boleh diaktifkan semula.' }, { status: 409 });
    }

    const { data: currentDevice } = await (admin as any)
      .from('pos_devices')
      .select('id')
      .eq('branch_id', device.branch_id)
      .in('status', ['PENDING', 'ACTIVE'])
      .neq('id', device.id)
      .limit(1)
      .maybeSingle();
    if (currentDevice) {
      return NextResponse.json({
        error: 'Cawangan ini sudah mempunyai slot atau tablet POS rasmi lain. Batalkan rekod tersebut dahulu.',
      }, { status: 409 });
    }

    const { error: reactivateError } = await (admin as any)
      .from('pos_devices')
      .update({
        status: 'PENDING',
        secret_hash: null,
        enrollment_code_hash: null,
        enrollment_expires_at: null,
        enrollment_used_at: null,
        enrolled_at: null,
        enrolled_by: null,
        last_seen_at: null,
        revoked_at: null,
        revoked_by: null,
        updated_at: now,
      })
      .eq('id', deviceId)
      .eq('organization_id', profile.organization_id)
      .eq('status', 'REVOKED');
    if (reactivateError) {
      const conflict = reactivateError.code === '23505';
      return NextResponse.json({
        error: conflict
          ? 'Cawangan ini sudah mempunyai slot atau tablet POS rasmi lain.'
          : reactivateError.message,
      }, { status: conflict ? 409 : 400 });
    }
    return NextResponse.json({ success: true, status: 'PENDING' });
  }

  const { error } = await (admin as any)
    .from('pos_devices')
    .update({
      status: 'REVOKED',
      secret_hash: null,
      enrollment_code_hash: null,
      revoked_at: now,
      revoked_by: profile.id,
      updated_at: now,
    })
    .eq('id', deviceId)
    .eq('organization_id', profile.organization_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
