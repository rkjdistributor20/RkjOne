'use client';

import { useRef, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ClientJsonError } from '@/lib/client/fetch-json';
import { receiveTransfer, reverseTransfer, type TransferReceiptDocument, type TransferReceiptInput } from '@/lib/inventory/transfer-receipts';
import { formatExpiryDate } from '@/lib/stock/expiry';
import { labelFor, TRANSFER_STATUS_LABELS } from '@/lib/ui/labels';

type Line = NonNullable<TransferReceiptDocument['stock_transfer_items']>[number];
const quantity = new Intl.NumberFormat('ms-MY', { maximumFractionDigits: 4 });
const dateTime = new Intl.DateTimeFormat('ms-MY', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Kuala_Lumpur' });
const remaining = (line: Line) => Number((line.quantity - (line.received_quantity ?? 0)).toFixed(4));
const lineLabel = (line: Line) =>
 line.stock_item.name + (line.production_date ? ` · Prod ${formatExpiryDate(line.production_date)}` : '');
const count = (value: number, unit: string) => `${quantity.format(value)} ${unit}`;

export function TransferReceiptActions({ transfer, onChanged, onLegacyComplete }: {
 transfer: TransferReceiptDocument;
 onChanged: () => void;
 onLegacyComplete: (id: string) => Promise<void>;
}) {
 const lines = transfer.stock_transfer_items ?? [];
 const editable = lines.filter((line): line is Line & { id: string } => !!line.id);
 const lineMap = new Map(editable.map((line) => [line.id, line]));
 const version = transfer.receipt_version;
 const sent = !!transfer.dispatched_at || transfer.status === 'IN_TRANSIT' || transfer.status === 'DELIVERED';
 const closed = transfer.status === 'DELIVERED';
 return (
  <div className="mt-2 space-y-2">
   {transfer.reversal_of_number && (
    <p className="text-xs">Pembalikan bagi {transfer.reversal_of_number} · {transfer.reversal_reason}</p>
   )}
   {transfer.reversal_number && (
    <p className="text-xs">
     Dokumen pembalikan: {transfer.reversal_number}
     {transfer.reversal_status && ` · ${labelFor(TRANSFER_STATUS_LABELS, transfer.reversal_status)}`}
    </p>
   )}
   {lines.length > 0 && (
    <ul className="space-y-1 text-xs text-muted-foreground">
     {lines.map((line, index) => (
      <li key={line.id ?? index}>
       {lineLabel(line)} — {sent ? 'Dihantar' : 'Kuantiti'}: {count(line.quantity, line.unit)}
       {sent && (line.received_quantity != null || (!transfer.managed_delivery && transfer.status === 'IN_TRANSIT')) && (
        <> · Diterima dalam stok: {count(line.received_quantity ?? 0, line.unit)}
         {remaining(line) !== 0 && <> · {remaining(line) < 0 ? 'Lebihan' : closed ? 'Kekurangan ditutup' : 'Baki belum diterima'}: {count(Math.abs(remaining(line)), line.unit)}</>}
        </>
       )}
      </li>
     ))}
    </ul>
   )}
   {!!transfer.receipts?.length && (
    <details className="text-xs text-muted-foreground">
     <summary className="cursor-pointer">Sejarah penerimaan ({transfer.receipts.length})</summary>
     <ul className="mt-1 space-y-1">
      {transfer.receipts.map((entry) => (
       <li key={entry.version}>
        {dateTime.format(new Date(entry.created_at))} · {entry.closed ? 'Ditutup' : 'Separa'}
        {entry.reason && ` — ${entry.reason}`}
        {entry.items.some((item) => item.quantity > 0) && (
         <ul className="ml-3">
          {entry.items.filter((item) => item.quantity > 0).map((item) => {
           const line = lineMap.get(item.item_id);
           if (!line) return null;
           const excess = entry.excess_items.find((row) => row.item_id === item.item_id);
           return <li key={item.item_id}>{lineLabel(line)}: sebenar {count(item.quantity, line.unit)}
            {excess && ` · Lebihan tidak dipos: ${count(excess.quantity, line.unit)}`}
           </li>;
          })}
         </ul>
        )}
       </li>
      ))}
     </ul>
    </details>
   )}
   {transfer.managed_delivery && transfer.status === 'IN_TRANSIT' && (
    <p className="text-xs text-muted-foreground">Penerimaan melalui aliran penghantaran/POS.</p>
   )}
   {transfer.can_complete && (version === undefined || transfer.legacy_full_receipt_only) && (
    <div className="space-y-1">
     {transfer.legacy_full_receipt_only && <p className="text-xs text-muted-foreground">
      Rekod lama tanpa batch penghantaran. Sahkan hanya jika semua kuantiti fizikal sepadan; rujuk HQ jika ada perbezaan.
     </p>}
     <Button type="button" size="sm" variant="outline" onClick={() => onLegacyComplete(transfer.id)}>Sahkan penerimaan penuh</Button>
    </div>
   )}
   {transfer.can_complete && version !== undefined && !transfer.legacy_full_receipt_only && editable.length > 0 && (
    <ReceiptForm key={version} id={transfer.id} lines={editable} version={version} onChanged={onChanged} />
   )}
   {transfer.can_reverse && <ReversalForm id={transfer.id} onChanged={onChanged} />}
  </div>
 );
}

function ReceiptForm({ id, lines, version, onChanged }: {
 id: string;
 lines: Array<Line & { id: string }>;
 version: number;
 onChanged: () => void;
}) {
 const [open, setOpen] = useState(false);
 const [values, setValues] = useState<Record<string, string>>({});
 const [reason, setReason] = useState('');
 const [finalize, setFinalize] = useState(false);
 const [busy, setBusy] = useState(false);
 const inFlight = useRef(false);
 const attempt = useRef<{ body: string; key: string } | null>(null);
 const entries = lines.map((line) => {
  const raw = values[line.id] ?? String(Math.max(0, remaining(line)));
  const value = /^\d+(\.\d{1,4})?$/.test(raw) ? Number(raw) : NaN;
  return { line, raw, value };
 });
 const invalid = entries.some(({ value }) => !Number.isFinite(value) || value >= 10_000_000_000);
 const short = entries.some(({ line, value }) => value < remaining(line));
 const excess = entries.some(({ line, value }) => value > remaining(line));
 const empty = entries.every(({ value }) => value === 0);
 const disabled = busy || invalid || ((short || excess) && !reason.trim()) || (empty && !(short && finalize));

 async function submit(event: FormEvent) {
  event.preventDefault();
  if (disabled || inFlight.current) return;
  const input: TransferReceiptInput = {
   receipt_version: version,
   items: entries.filter(({ value }) => value > 0).map(({ line, value }) => ({ item_id: line.id, quantity: value })),
   finalize: short && finalize,
   reason: short || excess ? reason.trim() : null,
  };
  const body = JSON.stringify(input);
  if (!attempt.current || attempt.current.body !== body) attempt.current = { body, key: crypto.randomUUID() };
  inFlight.current = true;
  setBusy(true);
  try {
   const { result } = await receiveTransfer(id, input, attempt.current.key);
   setOpen(false);
   toast.success(result.status === 'DELIVERED' ? 'Penerimaan ditutup' : 'Penerimaan separa direkodkan');
   onChanged();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal merekodkan penerimaan');
   if (error instanceof ClientJsonError && error.status === 409) onChanged();
  } finally {
   inFlight.current = false;
   setBusy(false);
  }
 }

 if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Rekod penerimaan</Button>;
 return (
  <form onSubmit={submit} className="max-w-xl space-y-2 rounded-md border p-3">
   <fieldset disabled={busy} className="space-y-2">
    <legend className="text-sm font-medium">Kuantiti sebenar diterima sekarang</legend>
    {entries.map(({ line, raw }) => (
     <label key={line.id} className="flex flex-wrap items-center justify-between gap-2 text-xs">
      <span>{lineLabel(line)} · Baki: {count(remaining(line), line.unit)}</span>
      <Input className="h-8 w-28" inputMode="decimal" value={raw} required
       onChange={(e) => setValues((prev) => ({ ...prev, [line.id]: e.target.value }))} />
     </label>
    ))}
    {invalid && <p className="text-xs text-destructive">Masukkan kuantiti yang sah dengan maksimum 4 perpuluhan.</p>}
    {excess && <p className="text-xs text-muted-foreground">Lebihan akan direkod, tetapi tidak dimasukkan ke stok. Rekonsiliasi berasingan diperlukan.</p>}
    {(short || excess) && (
     <Textarea aria-label="Sebab penerimaan berbeza" placeholder="Sebab penerimaan berbeza" maxLength={500}
      required value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
    )}
    {short && (
      <label className="flex items-center gap-2 text-xs">
       <input type="checkbox" checked={finalize} onChange={(e) => setFinalize(e.target.checked)} />
       Tutup pindahan; baki direkod sebagai kekurangan, bukan stok masuk.
      </label>
    )}
   </fieldset>
   <div className="flex flex-wrap gap-2">
    <Button size="sm" disabled={disabled}>{short && !finalize ? 'Simpan penerimaan separa' : 'Sahkan dan tutup'}</Button>
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Kembali</Button>
   </div>
  </form>
 );
}

function ReversalForm({ id, onChanged }: { id: string; onChanged: () => void }) {
 const [open, setOpen] = useState(false);
 const [reason, setReason] = useState('');
 const [busy, setBusy] = useState(false);
 const inFlight = useRef(false);

 async function submit(event: FormEvent) {
  event.preventDefault();
  if (!reason.trim() || inFlight.current) return;
  inFlight.current = true;
  setBusy(true);
  try {
   const { result } = await reverseTransfer(id, reason.trim());
   toast.success(`Pembalikan ${result.transfer_number} dihantar. Menunggu penerimaan pihak asal.`);
   setOpen(false);
   onChanged();
  } catch (error) {
   toast.error(error instanceof Error ? error.message : 'Gagal menghantar pembalikan');
   if (error instanceof ClientJsonError && error.status === 409) onChanged();
  } finally {
   inFlight.current = false;
   setBusy(false);
  }
 }

 if (!open) return <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>Pembalikan stok</Button>;
 return (
  <form onSubmit={submit} className="max-w-xl space-y-2 rounded-md border p-3">
   <p className="text-xs text-muted-foreground">
    Hanya stok yang telah diterima akan dihantar balik. Stok ditolak di sini; pihak asal mesti mengesahkan penerimaan.
   </p>
   <Textarea aria-label="Sebab pembalikan" placeholder="Sebab pembalikan" value={reason}
    onChange={(e) => setReason(e.target.value)} maxLength={500} required disabled={busy} rows={2} />
   <div className="flex flex-wrap gap-2">
    <Button size="sm" variant="destructive" disabled={busy || !reason.trim()}>Sahkan hantar balik</Button>
    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>Kembali</Button>
   </div>
  </form>
 );
}
