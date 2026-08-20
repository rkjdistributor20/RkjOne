import type { SaleResult } from '@/lib/pos/types';

export const RECEIPT_58MM_COLUMNS = 32;

function ascii(value: string) {
 return value
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7E]/g, '')
  .replace(/\s+/g, ' ')
  .trim();
}

function center(value: string) {
 const clean = ascii(value).slice(0, RECEIPT_58MM_COLUMNS);
 return `${' '.repeat(Math.max(0, Math.floor((RECEIPT_58MM_COLUMNS - clean.length) / 2)))}${clean}`;
}

function wrap(value: string, prefix = '') {
 const clean = ascii(value);
 const width = RECEIPT_58MM_COLUMNS - prefix.length;
 if (!clean) return [prefix.trimEnd()];
 const lines: string[] = [];
 let current = '';
 for (const word of clean.split(' ')) {
  if (word.length > width) {
   if (current) lines.push(`${prefix}${current}`);
   for (let index = 0; index < word.length; index += width) {
    lines.push(`${prefix}${word.slice(index, index + width)}`);
   }
   current = '';
  } else if (!current || current.length + word.length + 1 <= width) {
   current = current ? `${current} ${word}` : word;
  } else {
   lines.push(`${prefix}${current}`);
   current = word;
  }
 }
 if (current) lines.push(`${prefix}${current}`);
 return lines;
}

function money(value: number) {
 return `RM ${Number(value).toFixed(2)}`;
}

function leftRight(left: string, right: string) {
 const cleanLeft = ascii(left);
 const cleanRight = ascii(right);
 const available = RECEIPT_58MM_COLUMNS - cleanRight.length - 1;
 const trimmedLeft = cleanLeft.slice(0, Math.max(0, available));
 return `${trimmedLeft}${' '.repeat(Math.max(1, RECEIPT_58MM_COLUMNS - trimmedLeft.length - cleanRight.length))}${cleanRight}`;
}

export function build58mmReceipt(receipt: SaleResult, branchName?: string) {
 const lines = [
  center('ROTI KAYA JUNUS'),
  ...(branchName ? wrap(branchName).map(center) : []),
  '-'.repeat(RECEIPT_58MM_COLUMNS),
  ...wrap(`Resit: ${receipt.receipt_number}`),
  ...wrap(`Transaksi: ${receipt.transaction_number}`),
  '-'.repeat(RECEIPT_58MM_COLUMNS),
 ];

 for (const item of receipt.items) {
  lines.push(...wrap(`${item.quantity}x ${item.name}`));
  lines.push(leftRight(`  @ ${money(item.unit_price)}`, money(item.line_total)));
 }

 lines.push('-'.repeat(RECEIPT_58MM_COLUMNS));
 if (receipt.discount > 0) {
  lines.push(leftRight('SUBTOTAL', money(receipt.subtotal)));
  lines.push(leftRight('DISKAUN', `-${money(receipt.discount)}`));
 }
 lines.push(leftRight('JUMLAH', money(receipt.total)));
 if (receipt.change_amount > 0) lines.push(leftRight('BAKI', money(receipt.change_amount)));
 lines.push('', center('Terima kasih!'));

 return `${lines.join('\n')}\n`;
}
