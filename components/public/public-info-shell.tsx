import Link from 'next/link';
import type { ReactNode } from 'react';

import { BrandLogo } from '@/components/brand/brand-logo';

type PublicInfoShellProps = {
 eyebrow: string;
 title: string;
 intro: string;
 children: ReactNode;
};

const links = [
 { href: '/privacy', label: 'Privasi' },
 { href: '/support', label: 'Sokongan' },
 { href: '/delete-account', label: 'Padam Akaun' },
 { href: '/terms', label: 'Terma' },
];

export function PublicInfoShell({ eyebrow, title, intro, children }: PublicInfoShellProps) {
 return (
 <main className="min-h-screen bg-[#f6f1e7] px-5 py-8 text-[#14120f] sm:py-12">
 <section className="mx-auto max-w-3xl overflow-hidden rounded-[8px] border border-[#eadfca] bg-white shadow-xl shadow-[#b8871a]/10">
 <header className="border-b border-[#eadfca] bg-[#111711] px-6 py-7 text-white sm:px-8">
 <div className="flex items-center gap-4">
 <BrandLogo size="md" showText={false} />
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#f0c030]">{eyebrow}</p>
 <h1 className="mt-1 text-3xl font-bold !text-white">{title}</h1>
 </div>
 </div>
 <p className="mt-5 max-w-2xl text-sm leading-7 text-white/75">{intro}</p>
 </header>

 <nav aria-label="Maklumat awam RKJ One" className="flex flex-wrap gap-x-5 gap-y-2 border-b border-[#eadfca] px-6 py-4 text-sm font-semibold sm:px-8">
 {links.map((item) => (
 <Link key={item.href} href={item.href} className="text-[#6b5319] underline-offset-4 hover:underline">
 {item.label}
 </Link>))}
 </nav>

 <div className="space-y-7 px-6 py-8 text-sm leading-7 text-[#5f574f] sm:px-8">{children}</div>

 <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#eadfca] bg-[#fbfaf7] px-6 py-5 text-sm sm:px-8">
 <p className="text-[#71695f]">RKJ Distributor Sdn. Bhd. · Dikemas kini 21 Julai 2026</p>
 <Link href="/login" className="inline-flex h-10 items-center justify-center rounded-[8px] bg-[#e9b127] px-4 font-semibold text-black transition-colors hover:bg-[#d19a10]">
 Log Masuk
 </Link>
 </footer>
 </section>
 </main>);
}
