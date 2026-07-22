import type { Metadata } from 'next';

import { PublicInfoShell } from '@/components/public/public-info-shell';

export const metadata: Metadata = {
 title: 'Terma Penggunaan',
 description: 'Terma penggunaan rasmi RKJ One Staff.',
};

export default function TermsPage() {
 return (
 <PublicInfoShell
 eyebrow="RKJ One Staff"
 title="Terma Penggunaan"
 intro="Terma ini terpakai kepada semua pengguna yang diberi akses kepada RKJ One oleh syarikat."
 >
 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Akses yang dibenarkan</h2>
 <p>Aplikasi hanya boleh digunakan untuk tugasan syarikat mengikut peranan dan skop yang diberikan. Pengguna tidak boleh berkongsi akaun, menyamar sebagai pengguna lain atau cuba mengakses data di luar tanggungjawabnya.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Ketepatan rekod</h2>
 <p>Pengguna bertanggungjawab memasukkan maklumat operasi yang tepat, termasuk jualan, stok, syif, penghantaran, bukti serahan dan tuntutan. Kesilapan hendaklah dilaporkan segera kepada penyelia.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Peranti, lokasi dan keselamatan</h2>
 <p>Kebenaran kamera atau lokasi hanya perlu diberikan apabila fungsi kerja berkaitan digunakan. Pengguna mesti melindungi peranti, kata laluan dan OTP serta melaporkan kehilangan peranti atau aktiviti mencurigakan dengan segera.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Penggantungan akses</h2>
 <p>Syarikat boleh mengehadkan atau menamatkan akses apabila tugas berubah, pekerjaan tamat, terdapat risiko keselamatan atau berlaku pelanggaran polisi. Rekod audit boleh digunakan untuk siasatan dalaman dan pematuhan yang sah.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Pertanyaan</h2>
 <p>Hubungi <a className="font-semibold text-[#6b5319] underline" href="mailto:developer@rkj.one">developer@rkj.one</a> untuk pertanyaan tentang terma ini.</p>
 </section>
 </PublicInfoShell>);
}
