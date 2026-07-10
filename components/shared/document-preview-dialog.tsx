'use client';

/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from 'react';
import { Download, FileWarning, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

type DocumentPreviewDialogProps = {
 open: boolean;
 title: string;
 fileName: string;
 mimeType?: string | null;
 viewUrl: string;
 downloadUrl?: string | null;
 onClose: () => void;
};

function canPreviewInline(mimeType: string | null | undefined, fileName: string) {
 const mime = mimeType?.toLowerCase() ?? '';
 const file = fileName.toLowerCase();
 return mime.includes('pdf') || mime.startsWith('image/') || /\.(pdf|png|jpe?g|webp)$/i.test(file);
}

function isImageFile(mimeType: string | null | undefined, fileName: string) {
 const mime = mimeType?.toLowerCase() ?? '';
 return mime.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(fileName.toLowerCase());
}

async function readPreviewError(response: Response) {
 const text = await response.text().catch(() => '');
 let message = text || `Gagal buka dokumen (${response.status})`;

 try {
 const body = JSON.parse(text) as { error?: string; detail?: string };
 message = body.error || body.detail || message;
 } catch {
 // Response may be plain text from storage or a proxy.
 }

 if (/object not found/i.test(message)) {
 return 'Fail dokumen tidak ditemui dalam storage. Sila muat naik semula fail ini atau cuba refresh halaman.';
 }

 return message;
}

export function DocumentPreviewDialog({
 open,
 title,
 fileName,
 mimeType,
 viewUrl,
 downloadUrl,
 onClose,
}: DocumentPreviewDialogProps) {
 const [objectUrl, setObjectUrl] = useState<string | null>(null);
 const [loading, setLoading] = useState(false);
 const [error, setError] = useState<string | null>(null);
 const inline = canPreviewInline(mimeType, fileName);
 const image = isImageFile(mimeType, fileName);

 useEffect(() => {
 if (!open) return;
 let cancelled = false;
 let nextObjectUrl: string | null = null;

 async function loadPreview() {
 if (!inline) return;
 setLoading(true);
 setError(null);
 setObjectUrl(null);
 try {
 const response = await fetch(viewUrl, {
 credentials: 'same-origin',
 cache: 'no-store',
 });
 if (!response.ok) {
 throw new Error(await readPreviewError(response));
 }
 const blob = await response.blob();
 nextObjectUrl = URL.createObjectURL(blob);
 if (!cancelled) setObjectUrl(nextObjectUrl);
 } catch (err) {
 if (!cancelled) {
 setError(err instanceof Error ? err.message : 'Dokumen tidak boleh dipaparkan');
 }
 } finally {
 if (!cancelled) setLoading(false);
 }
 }

 void loadPreview();

 return () => {
 cancelled = true;
 if (nextObjectUrl) URL.revokeObjectURL(nextObjectUrl);
 };
 }, [inline, open, viewUrl]);

 if (!open) return null;

 return (
 <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
 <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl">
 <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
 <div className="min-w-0">
 <p className="truncate font-semibold">{title}</p>
 <p className="truncate text-xs text-muted-foreground">{fileName}</p>
 </div>
 <div className="flex shrink-0 gap-2">
 <Button
 type="button"
 size="sm"
 variant="outline"
 className="gap-1.5"
 disabled={!downloadUrl}
 onClick={() => {
 if (downloadUrl) window.open(downloadUrl, '_blank', 'noopener,noreferrer');
 }}
 >
 <Download className="h-3.5 w-3.5" />
 Download
 </Button>
 <Button type="button" size="sm" variant="ghost" onClick={onClose}>
 <X className="h-4 w-4" />
 </Button>
 </div>
 </div>

 <div className="min-h-[58vh] flex-1 bg-neutral-100">
 {!inline ? (
 <div className="flex h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
 <FileWarning className="h-10 w-10 text-muted-foreground" />
 <div>
 <p className="font-semibold">Preview tidak tersedia untuk jenis fail ini.</p>
 <p className="mt-1 text-sm text-muted-foreground">Gunakan butang Download untuk buka fail dalam aplikasi yang sesuai.</p>
 </div>
 </div>
 ) : loading ? (
 <div className="flex h-[70vh] items-center justify-center gap-2 text-sm text-muted-foreground">
 <Loader2 className="h-4 w-4 animate-spin" />
 Membuka dokumen...
 </div>
 ) : error ? (
 <div className="flex h-[70vh] flex-col items-center justify-center gap-3 p-8 text-center">
 <FileWarning className="h-10 w-10 text-red-500" />
 <div>
 <p className="font-semibold text-red-700">Dokumen tidak boleh dilihat.</p>
 <p className="mt-1 max-w-xl text-sm text-muted-foreground">{error}</p>
 </div>
 </div>
 ) : objectUrl ? (
 image ? (
 <div className="flex h-[70vh] items-center justify-center overflow-auto p-4">
 <img src={objectUrl} alt={title} className="max-h-full max-w-full rounded-lg bg-white object-contain shadow-sm" />
 </div>
 ) : (
 <iframe title={title} src={objectUrl} className="h-[70vh] w-full bg-white" />
 )
 ) : null}
 </div>
 </div>
 </div>);
}
