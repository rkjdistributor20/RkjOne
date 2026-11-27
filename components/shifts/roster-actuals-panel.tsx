'use client';

import { useEffect, useState } from 'react';
import { fetchRosterActuals } from '@/lib/roster/api';
import type { ScheduleComparison } from '@/lib/roster/types';
import { formatRosterTimestamp } from '@/lib/roster/week-utils';
import { Badge } from '@/components/ui/badge';

const comparisonLabel = {
 MATCH: 'Sepadan', DIFFERENT: 'Masa berbeza', UNSCHEDULED: 'Tiada jadual', UNATTRIBUTED: 'Staf tidak dipautkan',
};

export function RosterActualsPanel({ branchId, week }: { branchId?: string; week: string }) {
 const [rows, setRows] = useState<ScheduleComparison[] | null>(null);
 const [error, setError] = useState('');
 useEffect(() => {
  let active = true;
  fetchRosterActuals(week, branchId).then(({ actuals }) => { if (active) setRows(actuals); })
   .catch((err) => { if (active) setError(err.message); });
  return () => { active = false; };
 }, [branchId, week]);
 const needsReview = rows?.filter((row) => row.comparison !== 'MATCH').length ?? 0;

 return (
  <section className="space-y-2 rounded-xl border p-4">
   <h3 className="font-semibold">Jadual vs Masa Sebenar POS</h3>
   <p className="text-muted-foreground">
    Syif mengikut tarikh pembukaan (MYT). Padanan berdasarkan staf, cawangan dan masa; rekod POS hanya untuk semakan.
   </p>
   {needsReview > 0 && <Badge variant="secondary">{needsReview} syif untuk semakan</Badge>}
   {error ? <p role="alert" className="text-destructive">{error}</p> : !rows ? (
    <p className="text-muted-foreground">Memuatkan masa sebenar...</p>
   ) : rows.length === 0 ? <p className="text-muted-foreground">Tiada syif POS dibuka pada minggu ini.</p> : (
    <div className="overflow-x-auto">
     <table className="w-full min-w-[650px] text-left text-sm">
      <thead className="border-b"><tr>
       <th className="p-2">Cawangan / Syif</th><th className="p-2">Staf pembuka</th>
       <th className="p-2">Jadual mula / tamat</th><th className="p-2">POS buka / tutup</th><th className="p-2">Semakan</th>
      </tr></thead>
      <tbody>{rows.map((row) => (
       <tr key={row.id} className="border-b last:border-0">
        <td className="p-2">{row.branch_label}<div className="text-muted-foreground">{row.shift_number}</div></td>
        <td className="p-2">{row.staff_name ?? '—'}</td>
        <td className="p-2">{row.planned ? <>{formatRosterTimestamp(row.planned.starts_at)}<br />{formatRosterTimestamp(row.planned.ends_at)}</> : '—'}</td>
        <td className="p-2">{formatRosterTimestamp(row.opened_at)}<br />{row.closed_at ? formatRosterTimestamp(row.closed_at) : 'Belum tutup'}</td>
        <td className="p-2"><Badge variant={row.comparison === 'MATCH' ? 'outline' : 'secondary'}>
         {row.comparison === 'MATCH' && !row.closed_at ? 'Masa buka sepadan' : comparisonLabel[row.comparison]}
        </Badge></td>
       </tr>
      ))}</tbody>
     </table>
    </div>
   )}
  </section>
 );
}
