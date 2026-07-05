import type { Metadata } from 'next';
import Link from 'next/link';

import { BrandLogo } from '@/components/brand/brand-logo';

export const metadata: Metadata = {
 title: 'Polisi Privasi',
 description: 'Polisi privasi rasmi untuk penggunaan RKJ One.',
};

export default function PrivacyPage() {
 return (
 <main className="min-h-screen bg-[#f6f1e7] px-5 py-10 text-[#14120f]">
 <section className="mx-auto max-w-3xl rounded-[8px] border border-[#eadfca] bg-white p-6 shadow-xl shadow-[#b8871a]/10 sm:p-8">
 <div className="mb-8 flex items-center gap-4">
 <BrandLogo size="md" />
 <div>
 <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#9a741a]">RKJ One</p>
 <h1 className="font-serif text-3xl font-bold">Polisi Privasi</h1>
 </div>
 </div>

 <div className="space-y-6 text-sm leading-7 text-[#5f574f]">
 <p>
 RKJ One ialah sistem dalaman untuk pengguna berdaftar di bawah operasi Roti Kaya Junus.
 Aplikasi ini digunakan untuk tugasan kerja seperti POS, stok, penghantaran, HR, laporan dan
 rekod operasi yang dibenarkan oleh pihak syarikat.
 </p>

 <section className="space-y-2">
 <h2 className="font-serif text-xl font-bold text-[#14120f]">Data Yang Direkod</h2>
 <p>
 Sistem boleh merekod maklumat akaun pengguna, peranan kerja, cawangan, masa syif,
 transaksi POS, rekod stok, tugasan penghantaran, kelulusan, dokumen operasi dan log
 aktiviti yang diperlukan untuk menjalankan kerja.
 </p>
 </section>

 <section className="space-y-2">
 <h2 className="font-serif text-xl font-bold text-[#14120f]">Tujuan Penggunaan</h2>
 <p>
 Data digunakan untuk pengesahan pengguna, kawalan akses, audit operasi, pengiraan stok,
 pemantauan tugasan, penyediaan laporan dan keselamatan sistem. Data tidak dipaparkan
 kepada pengguna yang tiada akses berkaitan.
 </p>
 </section>

 <section className="space-y-2">
 <h2 className="font-serif text-xl font-bold text-[#14120f]">Keselamatan</h2>
 <p>
 RKJ One menggunakan akses berasaskan peranan, sambungan HTTPS, rekod audit dan kawalan
 sesi bagi melindungi maklumat operasi. Pengguna bertanggungjawab menjaga kata laluan dan
 tidak berkongsi akaun.
 </p>
 </section>

 <section className="space-y-2">
 <h2 className="font-serif text-xl font-bold text-[#14120f]">Pertanyaan</h2>
 <p>
 Untuk semakan, pembetulan atau pertanyaan berkaitan data, pengguna boleh berhubung
 dengan pentadbir RKJ One yang dilantik oleh syarikat.
 </p>
 </section>
 </div>

 <div className="mt-8">
 <Link
 href="/login"
 className="inline-flex h-11 items-center justify-center rounded-[8px] bg-[#e9b127] px-5 text-sm font-semibold text-black transition-colors hover:bg-[#d19a10]"
 >
 Kembali ke Log Masuk
 </Link>
 </div>
 </section>
 </main>);
}
