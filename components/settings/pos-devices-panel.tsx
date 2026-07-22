'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Ban, CheckCircle2, CircleAlert, Clock3, Copy, KeyRound, Layers3, Plus, ShieldCheck, TabletSmartphone } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { matchOfficialTablet, POS_OFFICIAL_TABLETS } from '@/lib/pos/official-tablets';
import type { PosOfficialHardwareProfile } from '@/lib/pos/types';

type Branch = { id: string; branch_code: string; branch_name: string };
type Device = {
  id: string;
  branch_id: string;
  device_code: string;
  device_name: string;
  status: 'PENDING' | 'ACTIVE' | 'REVOKED';
  enrollment_expires_at: string | null;
  enrolled_at: string | null;
  last_seen_at: string | null;
  enrollment_ready: boolean;
  hardware_profile: PosOfficialHardwareProfile | null;
  serial_number: string | null;
  imei: string | null;
  purchase_date: string | null;
  warranty_expires_at: string | null;
  asset_verified_at: string | null;
  management: {
    nativeApp: boolean;
    deviceOwner: boolean;
    lockTaskPermitted: boolean;
    lockTaskActive: boolean;
    screenLockSecure: boolean;
    manufacturer: string | null;
    model: string | null;
    androidVersion: string | null;
    reportedAt: string | null;
  } | null;
  branch: { branch_code: string; branch_name: string } | Array<{ branch_code: string; branch_name: string }> | null;
};

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? 'Permintaan gagal');
  return data;
}

function formatDate(value: string | null) {
  if (!value) return 'Belum pernah';
  return new Intl.DateTimeFormat('ms-MY', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Kuala_Lumpur',
  }).format(new Date(value));
}

export function PosDevicesPanel() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [deviceName, setDeviceName] = useState('Tablet POS Cawangan');
  const [hardwareProfile, setHardwareProfile] = useState<PosOfficialHardwareProfile | ''>('');
  const [serialNumber, setSerialNumber] = useState('');
  const [imei, setImei] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [bulkSaving, setBulkSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await requestJson<{ devices: Device[]; branches: Branch[] }>('/api/settings/pos-devices');
      setDevices(data.devices);
      setBranches(data.branches);
      setBranchId((current) => current || data.branches[0]?.id || '');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal memuatkan tablet POS');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const activeCount = useMemo(
    () => devices.filter((device) => device.status === 'ACTIVE').length,
    [devices],
  );
  const waitingCount = useMemo(
    () => devices.filter((device) => device.status === 'PENDING').length,
    [devices],
  );
  const preparedCount = useMemo(
    () => new Set(devices.filter((device) => device.status !== 'REVOKED').map((device) => device.branch_id)).size,
    [devices],
  );
  const compliantCount = useMemo(
    () => devices.filter((device) => device.status === 'ACTIVE'
      && device.management?.nativeApp
      && device.management?.deviceOwner
      && device.management?.lockTaskPermitted
      && device.management?.lockTaskActive
      && device.management?.screenLockSecure).length,
    [devices],
  );

  async function saveAsset(
    generateCode: boolean,
    targetBranchId = branchId,
    targetDeviceName = deviceName,
    targetHardwareProfile: PosOfficialHardwareProfile | null | '' = hardwareProfile,
  ) {
    if (!targetBranchId || targetDeviceName.trim().length < 3) {
      toast.error('Pilih cawangan dan masukkan nama tablet.');
      return;
    }
    const normalizedSerial = serialNumber.trim().toUpperCase().replace(/\s+/g, '');
    const normalizedImei = imei.replace(/\D/g, '');
    if (generateCode && normalizedSerial.length < 5) {
      toast.error('Masukkan nombor siri daripada kotak atau menu About tablet.');
      return;
    }
    if (generateCode && normalizedImei.length !== 15) {
      toast.error('IMEI mesti mengandungi tepat 15 digit.');
      return;
    }
    if (generateCode && !targetHardwareProfile) {
      toast.error('Pilih model tablet rasmi sebelum menjana kod.');
      return;
    }
    setSaving(true);
    try {
      const data = await requestJson<{
        enrollment_code: string | null;
        device: { enrollment_expires_at: string | null };
      }>('/api/settings/pos-devices', {
        method: 'POST',
        body: JSON.stringify({
          action: generateCode ? 'generate_code' : 'save_asset',
          branch_id: targetBranchId,
          device_name: targetDeviceName.trim(),
          hardware_profile: targetHardwareProfile,
          serial_number: normalizedSerial,
          imei: normalizedImei,
          purchase_date: purchaseDate || null,
          warranty_expires_at: warrantyExpiresAt || null,
        }),
      });
      setEnrollmentCode(data.enrollment_code ?? null);
      setExpiresAt(data.device.enrollment_expires_at ?? null);
      setSerialNumber(normalizedSerial);
      setImei(normalizedImei);
      toast.success(generateCode
        ? 'Aset disimpan dan kod aktivasi dijana'
        : normalizedSerial && normalizedImei && targetHardwareProfile
          ? 'Maklumat aset tablet berjaya disimpan'
          : 'Slot tablet berjaya disimpan sebagai draf');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal menyimpan rekod aset tablet');
    } finally {
      setSaving(false);
    }
  }

  function prepareDevice(device: Device) {
    setBranchId(device.branch_id);
    setDeviceName(device.device_name);
    setHardwareProfile(device.hardware_profile ?? '');
    setSerialNumber(device.serial_number ?? '');
    setImei(device.imei ?? '');
    setPurchaseDate(device.purchase_date ?? '');
    setWarrantyExpiresAt(device.warranty_expires_at ?? '');
    document.getElementById('pos-device-activation')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    toast.info('Maklumat boleh disimpan sebagai draf. Lengkapkan semuanya hanya apabila hendak menjana kod.');
  }

  async function prepareAllBranches() {
    setBulkSaving(true);
    try {
      const data = await requestJson<{ created: number; total: number }>('/api/settings/pos-devices', {
        method: 'POST',
        body: JSON.stringify({ action: 'prepare_all' }),
      });
      toast.success(data.created > 0
        ? `${data.created} cawangan berjaya dipra-daftar`
        : 'Semua cawangan sudah mempunyai slot tablet');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal mempra-daftar cawangan');
    } finally {
      setBulkSaving(false);
    }
  }

  async function cancelDevice(device: Device) {
    if (!window.confirm(`Batalkan ${device.device_name}? Rekod aset, kod aktivasi dan akses tablet ini akan dipadam. Untuk menggunakannya semula, tablet mesti didaftarkan semula.`)) return;
    try {
      await requestJson('/api/settings/pos-devices', {
        method: 'DELETE',
        body: JSON.stringify({ device_id: device.id }),
      });
      toast.success('Tablet dibatalkan dan rekodnya telah dipadam');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Gagal membatalkan tablet');
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-muted-foreground">Tablet aktif</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{activeCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-muted-foreground">Patuh keselamatan penuh</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{compliantCount} / {activeCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-muted-foreground">Menunggu tablet</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{waitingCount}</p>
        </div>
        <div className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-muted-foreground">Cawangan dipra-daftar</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{preparedCount} / {branches.length}</p>
        </div>
      </div>

      <section className="flex flex-col gap-4 rounded-lg border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="h-5 w-5 text-emerald-700" />
            <h3 className="font-semibold text-emerald-950">Pra-daftar semua cawangan</h3>
          </div>
          <p className="mt-1 text-sm text-emerald-900">Sediakan satu slot POS rasmi untuk setiap cawangan. Kod hanya dijana apabila tablet fizikal sudah tersedia.</p>
        </div>
        <Button className="shrink-0 gap-2" onClick={prepareAllBranches} disabled={bulkSaving || loading}>
          <Layers3 className="h-4 w-4" /> {bulkSaving ? 'Menyediakan...' : 'Pra-daftar Semua'}
        </Button>
      </section>

      <section className="rounded-lg border border-sky-200 bg-sky-50 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-sky-700" />
          <h3 className="font-semibold text-sky-950">Aliran penyediaan tablet rasmi</h3>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['1', 'Urus Android', 'Factory reset dan imbas QR Android Enterprise daripada HQ.'],
            ['2', 'Pasang automatik', 'RKJ One dipasang, aplikasi lain disekat dan kiosk diaktifkan.'],
            ['3', 'Aktif apabila sedia', 'Jana kod hanya apabila tablet sudah berada di cawangan dan sedia digunakan.'],
            ['4', 'Semak patuh', 'Staf login akaun sendiri, masukkan kod dan pastikan semua kawalan kiosk hijau.'],
          ].map(([number, title, description]) => (
            <div key={number} className="flex gap-3 border-l-2 border-sky-300 pl-3">
              <span className="font-mono text-lg font-bold text-sky-700">{number}</span>
              <div><p className="font-medium text-sky-950">{title}</p><p className="mt-1 text-xs text-sky-900/80">{description}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="pos-device-activation" className="scroll-mt-24 rounded-lg border bg-white">
        <div className="border-b px-4 py-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-amber-600" />
            <h3 className="font-semibold">Rekod aset dan aktifkan tablet</h3>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Belum ada tablet? Simpan cawangan sebagai draf dahulu. Lengkapkan model, nombor siri dan IMEI apabila tablet diterima, kemudian jana kod sekali guna.</p>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="pos-device-branch">Cawangan</Label>
            <select
              id="pos-device-branch"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
            >
              {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.branch_code} - {branch.branch_name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-name">Nama tablet</Label>
            <Input id="pos-device-name" value={deviceName} maxLength={80} onChange={(event) => setDeviceName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-hardware">Model rasmi</Label>
            <select
              id="pos-device-hardware"
              className="h-10 w-full rounded-md border bg-background px-3 text-sm"
              value={hardwareProfile}
              onChange={(event) => setHardwareProfile(event.target.value as PosOfficialHardwareProfile | '')}
            >
              <option value="">Belum ditetapkan</option>
              {Object.entries(POS_OFFICIAL_TABLETS).map(([key, tablet]) => (
                <option key={key} value={key}>{tablet.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-serial">Nombor siri <span className="font-normal text-muted-foreground">(pilihan untuk draf)</span></Label>
            <Input id="pos-device-serial" value={serialNumber} maxLength={64} placeholder="Contoh: R52X..." onChange={(event) => setSerialNumber(event.target.value.toUpperCase())} />
            <p className="text-xs text-muted-foreground">Salin daripada kotak atau Settings &gt; About tablet.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-imei">IMEI <span className="font-normal text-muted-foreground">(pilihan untuk draf)</span></Label>
            <Input id="pos-device-imei" value={imei} inputMode="numeric" maxLength={18} placeholder="15 digit" onChange={(event) => setImei(event.target.value.replace(/\D/g, '').slice(0, 15))} />
            <p className="text-xs text-muted-foreground">Gunakan IMEI utama jika tablet memaparkan lebih daripada satu.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-purchase">Tarikh pembelian</Label>
            <Input id="pos-device-purchase" type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pos-device-warranty">Tamat waranti</Label>
            <Input id="pos-device-warranty" type="date" min={purchaseDate || undefined} value={warrantyExpiresAt} onChange={(event) => setWarrantyExpiresAt(event.target.value)} />
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end xl:col-span-3">
            <Button variant="outline" onClick={() => void saveAsset(false)} disabled={saving || !branchId} className="w-full gap-2 sm:w-auto">
              <TabletSmartphone className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan Draf'}
            </Button>
            <Button onClick={() => void saveAsset(true)} disabled={saving || !branchId} className="w-full gap-2 sm:w-auto">
              <Plus className="h-4 w-4" /> {saving ? 'Menyimpan...' : 'Simpan & Jana Kod'}
            </Button>
          </div>
        </div>
        {enrollmentCode && (
          <div className="mx-4 mb-4 flex flex-col gap-3 rounded-lg border-2 border-amber-300 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-amber-800">Kod sekali guna</p>
              <p className="mt-1 font-mono text-3xl font-bold tracking-widest text-amber-950">{enrollmentCode}</p>
              <p className="mt-1 text-xs text-amber-800">Tamat: {formatDate(expiresAt)}</p>
            </div>
            <Button variant="outline" className="gap-2 bg-white" onClick={() => {
              void navigator.clipboard.writeText(enrollmentCode);
              toast.success('Kod disalin');
            }}>
              <Copy className="h-4 w-4" /> Salin
            </Button>
          </div>
        )}
      </section>

      <section className="overflow-hidden rounded-lg border bg-white">
        <div className="border-b px-4 py-4">
          <h3 className="font-semibold">Daftar tablet rasmi</h3>
          <p className="mt-1 text-sm text-muted-foreground">Pantau status, cawangan dan kali terakhir tablet digunakan.</p>
        </div>
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground">Memuatkan tablet...</p>
        ) : devices.length === 0 ? (
          <div className="p-8 text-center">
            <TabletSmartphone className="mx-auto h-9 w-9 text-muted-foreground" />
            <p className="mt-3 font-medium">Belum ada tablet didaftarkan</p>
            <p className="mt-1 text-sm text-muted-foreground">Mulakan dengan merekodkan aset tablet untuk satu cawangan.</p>
          </div>
        ) : (
          <div className="divide-y">
            {devices.map((device) => {
              const branch = Array.isArray(device.branch) ? device.branch[0] : device.branch;
              const hardwareMatch = matchOfficialTablet(
                device.hardware_profile,
                device.management?.manufacturer,
                device.management?.model,
              );
              return (
                <div key={device.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-100">
                      <TabletSmartphone className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{device.device_name}</p>
                        <Badge variant={device.status === 'ACTIVE' ? 'default' : 'outline'}>
                          {device.status === 'ACTIVE'
                            ? 'Aktif'
                            : device.status === 'PENDING'
                              ? (device.enrollment_ready ? 'Kod sedia' : device.asset_verified_at ? 'Aset direkod' : 'Menunggu tablet')
                              : 'Dibatalkan'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{branch?.branch_code} - {branch?.branch_name} - {device.device_code}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                        {device.status === 'ACTIVE' ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <Clock3 className="h-3.5 w-3.5" />}
                        Kali terakhir: {formatDate(device.last_seen_at)}
                      </p>
                      {device.serial_number && (
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span>No. siri: <strong className="text-foreground">{device.serial_number}</strong></span>
                          <span>IMEI: <strong className="text-foreground">{device.imei}</strong></span>
                          {device.purchase_date && <span>Dibeli: <strong className="text-foreground">{device.purchase_date}</strong></span>}
                          {device.warranty_expires_at && <span>Waranti: <strong className="text-foreground">{device.warranty_expires_at}</strong></span>}
                          {device.asset_verified_at && <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900">Disahkan HQ</Badge>}
                        </div>
                      )}
                      {device.status === 'ACTIVE' && (
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                          {device.management?.deviceOwner && device.management?.lockTaskActive && device.management?.screenLockSecure ? (
                            <Badge className="gap-1 bg-emerald-700"><ShieldCheck className="h-3 w-3" /> Patuh</Badge>
                          ) : (
                            <Badge variant="outline" className="gap-1 border-amber-300 bg-amber-50 text-amber-900"><CircleAlert className="h-3 w-3" /> Perlu Android Enterprise</Badge>
                          )}
                          {device.management?.model && <span>{device.management.manufacturer} {device.management.model} - Android {device.management.androidVersion}</span>}
                          <Badge
                            variant="outline"
                            className={hardwareMatch.state === 'MATCHED' || hardwareMatch.state === 'BRAND_MATCHED'
                              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
                              : 'border-amber-300 bg-amber-50 text-amber-900'}
                          >
                            {hardwareMatch.state === 'MATCHED' ? 'Model rasmi disahkan'
                              : hardwareMatch.state === 'BRAND_MATCHED' ? 'Jenama rasmi - sahkan model'
                              : hardwareMatch.label}
                          </Badge>
                        </div>
                      )}
                      {device.status !== 'ACTIVE' && device.hardware_profile && (
                        <p className="mt-2 text-xs font-medium text-sky-800">Ditetapkan: {POS_OFFICIAL_TABLETS[device.hardware_profile].label}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {device.status === 'PENDING' && (
                      <Button size="sm" className="gap-2" onClick={() => prepareDevice(device)} disabled={saving}>
                        <KeyRound className="h-4 w-4" /> {device.asset_verified_at ? 'Kemaskini Aset / Jana Kod' : 'Lengkapkan Aset'}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" className="gap-2 text-red-700" onClick={() => cancelDevice(device)}>
                      <Ban className="h-4 w-4" /> Batalkan
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
