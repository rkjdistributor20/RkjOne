'use client';

import { useState } from 'react';
import { Copy, Check, KeyRound, Mail } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface StaffCredentialsCardProps {
 loginEmail: string;
 password: string;
 mustChangePassword?: boolean;
 lastLoginAt?: string | null;
 compact?: boolean;
}

async function copyText(text: string) {
 await navigator.clipboard.writeText(text);
}

export function StaffCredentialsCard({
 loginEmail,
 password,
 mustChangePassword,
 lastLoginAt,
 compact = false,
}: StaffCredentialsCardProps) {
 const [copied, setCopied] = useState<'email' | 'pass' | null>(null);
 const passwordHidden = !password || password.startsWith('[HIDDEN');

 async function handleCopy(field: 'email' | 'pass', value: string) {
 await copyText(value);
 setCopied(field);
 setTimeout(() => setCopied(null), 2000);
 }

 return (
 <div
 className={
 compact
 ? 'space-y-2 rounded-lg border border-sky-200 bg-sky-50/60 p-3 text-sm'
 : 'space-y-3 rounded-xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-4'
 }
 >
 <div className="flex flex-wrap items-center gap-2">
 <KeyRound className="h-4 w-4 text-sky-700" />
 <span className="font-semibold text-sky-950">Akaun Log Masuk Portal</span>
 {mustChangePassword && (
 <Badge variant="secondary" className="text-[10px]">
 Mesti tukar password
 </Badge>)}
 </div>

 <div className="space-y-2">
 <div className="flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
 <div className="min-w-0">
 <p className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
 <Mail className="h-3 w-3" /> Username / Email
 </p>
 <p className="truncate font-mono text-sm">{loginEmail}</p>
 </div>
 <Button
 type="button"
 size="icon"
 variant="ghost"
 className="h-8 w-8 shrink-0"
 onClick={() => handleCopy('email', loginEmail)}
 >
 {copied === 'email' ? (
 <Check className="h-4 w-4 text-emerald-600" />) : (
 <Copy className="h-4 w-4" />)}
 </Button>
 </div>

 <div className="flex items-center justify-between gap-2 rounded-md border bg-white px-3 py-2">
 <div className="min-w-0">
 <p className="text-[10px] uppercase text-muted-foreground">Kata Laluan Sementara</p>
 {passwordHidden ? (
 <p className="text-xs text-muted-foreground">
 Tidak disimpan. Reset password untuk jana kata laluan baharu sekali sahaja.
 </p>) : (
 <p className="font-mono text-sm">{password}</p>)}
 </div>
 {!passwordHidden && (
 <Button
 type="button"
 size="icon"
 variant="ghost"
 className="h-8 w-8 shrink-0"
 onClick={() => handleCopy('pass', password)}
 >
 {copied === 'pass' ? (
 <Check className="h-4 w-4 text-emerald-600" />) : (
 <Copy className="h-4 w-4" />)}
 </Button>)}
 </div>
 </div>

 {lastLoginAt && (
 <p className="text-xs text-muted-foreground">
 Log masuk terakhir:{' '}
 {new Date(lastLoginAt).toLocaleString('ms-MY')}
 </p>)}

 <p className="text-xs text-muted-foreground">
 Kongsi password sementara hanya sekali kepada staf. Staf akan diarah tukar kata laluan
 pada log masuk pertama.
 </p>
 </div>);
}
