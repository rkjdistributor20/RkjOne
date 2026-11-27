'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Branch = { id: string; branch_name: string; branch_code: string; status?: string | null };

export function AmBranchGrantsDialog({ user, branches, onClose }: {
 user: { id: string; full_name: string };
 branches: Branch[];
 onClose: () => void;
}) {
 const [ids, setIds] = useState<string[] | null>(null);
 const [error, setError] = useState<string | null>(null);
 const [saving, setSaving] = useState(false);
 const endpoint = `/api/settings/users/${encodeURIComponent(user.id)}/area-branches`;
 useEffect(() => {
  const abort = new AbortController();
  void fetch(endpoint, { cache: 'no-store', signal: abort.signal })
   .then(async (response) => {
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.branch_ids)) throw new Error(data.error ?? 'Gagal memuatkan senarai cawangan.');
    if (!abort.signal.aborted) setIds(data.branch_ids);
   }).catch((err: unknown) => {
    if (!abort.signal.aborted) setError(err instanceof Error ? err.message : 'Gagal memuatkan senarai cawangan.');
   });
  return () => abort.abort();
 }, [endpoint]);

 async function save() {
  if (!ids || saving) return;
  setSaving(true);
  try {
   const response = await fetch(endpoint, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ branch_ids: ids }),
   });
   if (!response.ok) {
    const result = await response.json();
    throw new Error(result.error ?? 'Senarai cawangan tidak dapat disimpan.');
   }
   toast.success('Senarai cawangan AM disimpan.');
   onClose();
  } catch (err) {
   toast.error(err instanceof Error ? err.message : 'Senarai cawangan tidak dapat disimpan.');
  } finally {
   setSaving(false);
  }
 }

 const visible = [...branches].sort((a, b) => a.branch_code.localeCompare(b.branch_code));
 const knownIds = new Set(visible.map(branch => branch.id));
 const unlisted = ids?.filter(id => !knownIds.has(id)) ?? [];
 return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
  <DialogContent>
   <DialogHeader><DialogTitle>Cawangan jagaan · {user.full_name}</DialogTitle></DialogHeader>
   <p className="text-sm text-muted-foreground">Tandakan cawangan yang boleh diurus. Senarai kosong bermaksud tiada akses cawangan.</p>
   {error ? <p role="alert" className="text-sm text-destructive">{error}</p>
    : !ids ? <p className="text-sm">Memuatkan senarai cawangan…</p>
     : <div className="max-h-[52vh] space-y-1 overflow-y-auto">
       {visible.filter(branch => branch.status !== 'INACTIVE' || ids.includes(branch.id)).map(branch =>
        <label key={branch.id} className="flex items-center gap-2 rounded border p-2 text-sm">
         <input type="checkbox" checked={ids.includes(branch.id)}
          disabled={saving || (branch.status === 'INACTIVE' && !ids.includes(branch.id))}
          onChange={event => setIds(event.target.checked ? [...ids, branch.id] : ids.filter(id => id !== branch.id))} />
         <span>{branch.branch_code} · {branch.branch_name}</span>
        </label>)}
       {unlisted.length > 0 && <p role="alert" className="text-sm text-amber-800">Ada {unlisted.length} penetapan yang tiada dalam senarai semasa. Muat semula tetapan sebelum membuat perubahan.</p>}
      </div>}
   <DialogFooter>
    <Button variant="outline" disabled={saving} onClick={onClose}>Batal</Button>
    <Button disabled={saving || !ids || Boolean(unlisted.length)} onClick={() => void save()}>Simpan cawangan</Button>
   </DialogFooter>
  </DialogContent>
 </Dialog>;
}
