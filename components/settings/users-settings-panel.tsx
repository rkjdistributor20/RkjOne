'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Users, Store, Building2 } from 'lucide-react';
import { createUser, deleteUser } from '@/lib/settings/api';
import type { SettingsBranchGroup, SettingsUser } from '@/lib/settings/types';
import { ROLE_LABELS, type UserRole } from '@/types/enums';
import { useAuthStore } from '@/stores/auth-store';
import { UsersAdminPanel } from '@/components/settings/users-admin-panel';

import { Button } from '@/components/ui/button';

import { Input } from '@/components/ui/input';

import { Label } from '@/components/ui/label';

import { Badge } from '@/components/ui/badge';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

import {

  Dialog,

  DialogContent,

  DialogFooter,

  DialogHeader,

  DialogTitle,

} from '@/components/ui/dialog';

import {

  Select,

  SelectContent,

  SelectItem,

  SelectTrigger,

  SelectValue,

} from '@/components/ui/select';



const NO_BRANCH = '__none__';



interface UsersSettingsPanelProps {

  users: SettingsUser[];

  usersStaffTotal?: number;

  usersLoginTotal?: number;

  usersLoading?: boolean;

  usersError?: string | null;

  branchGroups: SettingsBranchGroup[];

  isAdmin: boolean;

  isAreaManager: boolean;

  creatableRoles: UserRole[];

  onRefresh: () => Promise<void>;

}



interface UserBranchGroup {

  branch_id: string;

  branch_code: string;

  branch_name: string;

  users: SettingsUser[];

}



interface UserRegionGroup {

  region_id: string;

  region_name: string;

  branches: UserBranchGroup[];

  user_count: number;

}



function groupUsers(users: SettingsUser[], branchGroups: SettingsBranchGroup[]): UserRegionGroup[] {

  const regionMeta = new Map(

    branchGroups.map((g) => [g.region_id, { name: g.region_name, code: g.region_code }])

  );



  const branchMeta = new Map<

    string,

    { branch_code: string; branch_name: string; region_id: string }

  >();

  for (const g of branchGroups) {

    for (const b of g.branches) {

      branchMeta.set(b.id, {

        branch_code: b.branch_code,

        branch_name: b.branch_name,

        region_id: g.region_id,

      });

    }

  }



  const hqUsers: SettingsUser[] = [];

  const byRegion = new Map<string, Map<string, SettingsUser[]>>();



  for (const user of users) {

    if (!user.branch_id) {

      hqUsers.push(user);

      continue;

    }



    const meta = branchMeta.get(user.branch_id);

    const regionId = user.region_id ?? meta?.region_id ?? 'unknown';

    const branchKey = user.branch_id;



    if (!byRegion.has(regionId)) byRegion.set(regionId, new Map());

    const regionMap = byRegion.get(regionId)!;

    const list = regionMap.get(branchKey) ?? [];

    list.push(user);

    regionMap.set(branchKey, list);

  }



  const groups: UserRegionGroup[] = [];



  if (hqUsers.length > 0) {

    groups.push({

      region_id: 'hq',

      region_name: 'Pusat / HQ',

      branches: [

        {

          branch_id: 'hq',

          branch_code: 'HQ',

          branch_name: 'Tiada cawangan kiosk',

          users: hqUsers.sort((a, b) => a.full_name.localeCompare(b.full_name)),

        },

      ],

      user_count: hqUsers.length,

    });

  }



  const regionIds = [

    ...new Set([

      ...branchGroups.map((g) => g.region_id),

      ...Array.from(byRegion.keys()),

    ]),

  ];



  for (const regionId of regionIds) {

    const regionMap = byRegion.get(regionId);

    if (!regionMap) continue;



    const meta = regionMeta.get(regionId);

    const branches: UserBranchGroup[] = [];



    for (const [branchId, branchUsers] of regionMap) {

      const bMeta = branchMeta.get(branchId);

      const first = branchUsers[0];

      branches.push({

        branch_id: branchId,

        branch_code: first.branch?.branch_code ?? bMeta?.branch_code ?? '—',

        branch_name: first.branch?.branch_name ?? bMeta?.branch_name ?? '—',

        users: branchUsers.sort((a, b) => a.full_name.localeCompare(b.full_name)),

      });

    }



    branches.sort((a, b) => a.branch_code.localeCompare(b.branch_code));



    groups.push({
      region_id: regionId,
      region_name:
        meta?.name ??
        branches[0]?.users[0]?.region?.name ??
        regionId,
      branches,
      user_count: branches.reduce((n, b) => n + b.users.length, 0),
    });

  }



  return groups.filter((g) => g.user_count > 0);
}

function statusBadge(status: string) {

  if (status === 'ACTIVE') {

    return (

      <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-800">

        Aktif

      </Badge>

    );

  }

  return <Badge variant="secondary">{status}</Badge>;

}



export function UsersSettingsPanel({
  users,
  usersStaffTotal,
  usersLoginTotal,
  usersLoading,
  usersError,
  branchGroups,
  isAdmin,
  isAreaManager,
  creatableRoles,
  onRefresh,
}: UsersSettingsPanelProps) {

  if (isAdmin) {
    return (
      <UsersAdminPanel
        users={users}
        staffTotal={usersStaffTotal}
        loginTotal={usersLoginTotal}
        loading={usersLoading}
        loadError={usersError}
        branchGroups={branchGroups}
        creatableRoles={creatableRoles}
        onRefresh={onRefresh}
      />
    );
  }

  const currentProfile = useAuthStore((s) => s.profile);

  const [addOpen, setAddOpen] = useState(false);

  const [fullName, setFullName] = useState('');

  const [email, setEmail] = useState('');

  const [role, setRole] = useState<UserRole>(creatableRoles[0] ?? 'STAFF');

  const [branchId, setBranchId] = useState('');

  const [saving, setSaving] = useState(false);



  const allBranches = branchGroups.flatMap((g) =>

    g.branches.map((b) => ({ ...b, region_name: g.region_name }))

  );



  const branchRequired = isAreaManager;

  const groups = useMemo(() => groupUsers(users, branchGroups), [users, branchGroups]);



  async function handleAdd() {

    if (!fullName.trim() || !email.trim()) {

      toast.error('Nama dan e-mel diperlukan');

      return;

    }

    if (branchRequired && !branchId) {

      toast.error('Pilih cawangan kiosk');

      return;

    }

    setSaving(true);

    try {

      await createUser({

        full_name: fullName.trim(),

        email: email.trim(),

        role,

        branch_id: branchId && branchId !== NO_BRANCH ? branchId : undefined,

      });

      toast.success('Pengguna ditambah — kata laluan default: RkjOne@2026');

      setAddOpen(false);

      setFullName('');

      setEmail('');

      setRole(creatableRoles[0] ?? 'STAFF');

      setBranchId('');

      await onRefresh();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Gagal tambah pengguna');

    } finally {

      setSaving(false);

    }

  }



  async function handleDelete(id: string, name: string) {

    if (id === currentProfile?.id) {

      toast.error('Tidak boleh padam akaun sendiri');

      return;

    }

    if (!confirm(`Padam pengguna "${name}"?`)) return;

    try {

      await deleteUser(id);

      toast.success('Pengguna dipadam');

      await onRefresh();

    } catch (err) {

      toast.error(err instanceof Error ? err.message : 'Gagal padam');

    }

  }



  return (

    <div className="space-y-4">

      {isAreaManager && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-950">
          Pengurus Kawasan: urus akaun login <strong>Staf kiosk</strong> dalam kawasan anda sahaja.
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="outline" className="gap-1.5 font-normal tabular-nums">
          <Users className="h-3.5 w-3.5" />
          {users.length} pengguna
        </Badge>
        <Button
          size="sm"
          className="gap-1.5 bg-amber-500 hover:bg-amber-600"
          onClick={() => setAddOpen(true)}
        >
          <Plus className="h-4 w-4" />
          Tambah Pengguna
        </Button>
      </div>



      {users.length === 0 ? (

        <p className="text-sm text-muted-foreground">Tiada pengguna berdaftar.</p>

      ) : (

        groups.map((group) => (

          <Card key={group.region_id}>

            <CardHeader className="pb-2">

              <CardTitle className="flex flex-wrap items-center gap-2 text-base">

                {group.region_id === 'hq' ? (

                  <Building2 className="h-4 w-4 text-primary" />

                ) : (

                  <Users className="h-4 w-4 text-primary" />

                )}

                {group.region_name}

                <Badge variant="outline" className="font-normal tabular-nums">

                  {group.user_count} pengguna

                </Badge>

              </CardTitle>

            </CardHeader>

            <CardContent className="space-y-3">

              {group.branches.map((branch) => (

                <div key={branch.branch_id} className="rounded-lg border bg-muted/20 p-3">

                  <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">

                    <Store className="h-3.5 w-3.5 text-muted-foreground" />

                    {branch.branch_code} — {branch.branch_name}

                  </p>

                  <div className="overflow-x-auto rounded-md border bg-background">

                    <table className="w-full text-sm">

                      <thead>

                        <tr className="border-b bg-muted/40 text-left text-xs">

                          <th className="p-2">Nama</th>

                          <th className="p-2">E-mel</th>

                          <th className="p-2">Peranan</th>

                          <th className="p-2">Status</th>

                          <th className="w-10 p-2" />

                        </tr>

                      </thead>

                      <tbody>

                        {branch.users.map((u) => (

                          <tr key={u.id} className="border-b last:border-0">

                            <td className="p-2 font-medium">{u.full_name}</td>

                            <td className="p-2 text-muted-foreground">{u.email}</td>

                            <td className="p-2">

                              <Badge variant="outline" className="font-normal">

                                {ROLE_LABELS[u.role as UserRole] ?? u.role}

                              </Badge>

                            </td>

                            <td className="p-2">{statusBadge(u.status)}</td>

                            <td className="p-2">

                              {u.id !== currentProfile?.id && (

                                <Button

                                  size="icon"

                                  variant="ghost"

                                  className="h-7 w-7 text-destructive"

                                  onClick={() => handleDelete(u.id, u.full_name)}

                                >

                                  <Trash2 className="h-3.5 w-3.5" />

                                </Button>

                              )}

                            </td>

                          </tr>

                        ))}

                      </tbody>

                    </table>

                  </div>

                </div>

              ))}

            </CardContent>

          </Card>

        ))

      )}



      <Dialog open={addOpen} onOpenChange={setAddOpen}>

        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">

          <DialogHeader>

            <DialogTitle>Tambah Pengguna</DialogTitle>

          </DialogHeader>

          <div className="space-y-3">

            <div className="space-y-1">

              <Label>Nama Penuh</Label>

              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />

            </div>

            <div className="space-y-1">

              <Label>E-mel</Label>

              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />

            </div>

            <div className="space-y-1">

              <Label>Peranan</Label>

              <Select value={role} onValueChange={(v) => v && setRole(v as UserRole)}>

                <SelectTrigger>

                  <SelectValue />

                </SelectTrigger>

                <SelectContent>

                  {creatableRoles.map((r) => (

                    <SelectItem key={r} value={r}>

                      {ROLE_LABELS[r]}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

            </div>

            <div className="space-y-1">

              <Label>Cawangan {branchRequired ? '' : '(pilihan)'}</Label>

              <Select

                value={branchId || NO_BRANCH}

                onValueChange={(v) => setBranchId(v === NO_BRANCH ? '' : (v ?? ''))}

              >

                <SelectTrigger>

                  <SelectValue placeholder={branchRequired ? 'Pilih cawangan' : 'Tiada'} />

                </SelectTrigger>

                <SelectContent>

                  {!branchRequired && (

                    <SelectItem value={NO_BRANCH}>Tiada / HQ</SelectItem>

                  )}

                  {allBranches.map((b) => (

                    <SelectItem key={b.id} value={b.id}>

                      {b.branch_code} — {b.branch_name}

                    </SelectItem>

                  ))}

                </SelectContent>

              </Select>

            </div>

            <p className="text-xs text-muted-foreground">

              Kata laluan sementara: RkjOne@2026 — pengguna mesti tukar selepas login.

            </p>

          </div>

          <DialogFooter>

            <Button variant="outline" onClick={() => setAddOpen(false)}>

              Batal

            </Button>

            <Button

              className="bg-amber-500 hover:bg-amber-600"

              disabled={saving}

              onClick={handleAdd}

            >

              {saving ? 'Menyimpan…' : 'Simpan'}

            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </div>

  );

}


