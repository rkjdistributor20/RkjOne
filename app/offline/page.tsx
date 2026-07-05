import { WifiOff } from 'lucide-react';
import Link from 'next/link';

import { BrandLogo } from '@/components/brand/brand-logo';
import { Card, CardContent } from '@/components/ui/card';

export default function OfflinePage() {
 return (
 <main className="flex min-h-screen items-center justify-center bg-[#f6f1e7] px-5 py-10 text-foreground">
 <Card className="w-full max-w-[440px] rounded-[8px] border-[#eadfca] bg-white/95 shadow-xl shadow-[#b8871a]/10">
 <CardContent className="space-y-6 px-7 py-8 text-center">
 <div className="flex justify-center">
 <BrandLogo size="lg" />
 </div>
 <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[8px] bg-[#111111] text-[#e9b127]">
 <WifiOff className="h-6 w-6" />
 </div>
 <div className="space-y-2">
 <h1 className="font-serif text-3xl font-bold">Sambungan Terputus</h1>
 <p className="text-sm leading-6 text-[#6b6257]">
 Semak internet peranti dan cuba semula. Data operasi tidak dipaparkan semasa offline untuk
 keselamatan akaun.
 </p>
 </div>
 <Link
 href="/login"
 className="inline-flex h-11 w-full items-center justify-center rounded-[8px] bg-[#e9b127] px-4 text-sm font-semibold text-black transition-colors hover:bg-[#d19a10]"
 >
 Cuba Semula
 </Link>
 </CardContent>
 </Card>
 </main>);
}
