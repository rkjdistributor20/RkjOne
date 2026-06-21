'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2, Store, Users } from 'lucide-react';
import {
  createBranch,
  deleteBranch,
  updateBranch,
} from '@/lib/settings/api';
import type { SettingsBranchGroup, SettingsRegion } from '@/lib/settings/types';
import { ShopToggle } from '@/components/settings/shop-toggle';
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
import { EmptyState } from '@/components/shared/module-ui';

interface BranchesSettingsPanelProps {
  groups: SettingsBranchGroup[];
  regions: SettingsRegion[];
  isAdmin: boolean;
  onRefresh: () => Promise<void>;
}

export function BranchesSettingsPanel({
  groups,
  regions,
  isAdmin,
  onRefresh,
}: BranchesSettingsPanelProps) {
  const [addOpen, setAddOpen] = useState(false);
  const [regionId, setRegionId] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchName, setBranchName] = useState('');
  const [area, setArea] = useState('');
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  async function handleAdd() {
    if (!regionId || !branchCode.trim() || !branchName.trim()) {
      toast.error('Lengkapkan kawasan, kod, dan nama cawangan');
      return;
    }
    setSaving(true);
    try {
      await createBranch({
        region_id: regionId,
        branch_code: branchCode.trim(),
        branch_name: branchName.trim(),
        area: area.trim() || undefined,
      });
      toast.success('Cawangan ditambah');
      setAddOpen(false);
      setBranchCode('');
      setBranchName('');
      setArea('');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal tambah cawangan');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(branchId: string, active: boolean) {
    setTogglingId(branchId);
    try {
      await updateBranch(branchId, { status: active ? 'ACTIVE' : 'INACTIVE' });
      toast.success(active ? 'Kedai dibuka (ON)' : 'Kedai ditutup (OFF)');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal kemaskini status');
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete(branchId: string, name: string) {
    if (!confirm(`Padam cawangan "${name}"? Hanya dibenarkan jika tiada rekod jualan/staf.`)) {
      return;
    }
    try {
      await deleteBranch(branchId);
      toast.success('Cawangan dipadam');
      await onRefresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal padam');
    }
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Tiada cawangan"
        description={isAdmin ? 'Tambah cawangan kiosk baharu.' : undefined}
      />
    );
  }

  return (
    <div className="space-y-4">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Tambah Cawangan
          </Button>
        </div>
      )}

      {groups.map((group) => (
        <Card key={group.region_id}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" />
              {group.region_name}
              {group.manager_name && (
                <Badge variant="secondary" className="font-normal">
                  Pengurus Kawasan: {group.manager_name}
                </Badge>
              )}
              <Badge variant="outline" className="font-normal tabular-nums">
                {group.branches.length} kedai
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.branches.map((b) => {
              const isOpen = b.status === 'ACTIVE';
              return (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{b.branch_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {b.branch_code}
                      {b.area ? ` · ${b.area}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isAdmin && (
                      <ShopToggle
                        active={isOpen}
                        disabled={togglingId === b.id}
                        onToggle={(on) => handleToggle(b.id, on)}
                        label="Kedai"
                      />
                    )}
                    {!isAdmin && (
                      <Badge variant={isOpen ? 'default' : 'secondary'}>
                        {isOpen ? 'Buka' : 'Tutup'}
                      </Badge>
                    )}
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(b.id, b.branch_name)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah Cawangan Kiosk</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Kawasan (Pengurus Kawasan)</Label>
              <Select value={regionId} onValueChange={(v) => v && setRegionId(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Pilih kawasan" />
                </SelectTrigger>
                <SelectContent>
                  {regions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} {r.manager_name ? `· ${r.manager_name}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Kod Cawangan</Label>
              <Input
                placeholder="cth BR037"
                value={branchCode}
                onChange={(e) => setBranchCode(e.target.value.toUpperCase())}
              />
            </div>
            <div className="space-y-1">
              <Label>Nama Kedai</Label>
              <Input
                placeholder="Nama lokasi kiosk"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Kawasan / Zon (pilihan)</Label>
              <Input value={area} onChange={(e) => setArea(e.target.value)} />
            </div>
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
