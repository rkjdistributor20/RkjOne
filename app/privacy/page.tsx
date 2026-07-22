import type { Metadata } from 'next';

import { PublicInfoShell } from '@/components/public/public-info-shell';

export const metadata: Metadata = {
 title: 'Polisi Privasi',
 description: 'Polisi privasi rasmi untuk penggunaan RKJ One.',
};

export default function PrivacyPage() {
 return (
 <PublicInfoShell
 eyebrow="RKJ One Staff"
 title="Polisi Privasi"
 intro="Polisi ini menerangkan cara maklumat pengguna berdaftar diproses dalam sistem operasi dalaman RKJ One."
 >
 <p>
 RKJ One ialah sistem dalaman untuk staf dan pihak pengurusan yang diberi kuasa di bawah operasi Kumpulan Roti Kaya Junus. Tiada pendaftaran akaun awam; akaun dan akses diwujudkan oleh pentadbir syarikat mengikut peranan kerja.
 </p>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Data yang direkod</h2>
 <p>Sistem boleh merekod nama, e-mel, nombor telefon, ID staf, peranan, syarikat dan cawangan; rekod syif, kehadiran, HR dan gaji yang dibenarkan; transaksi POS, stok, pesanan, penghantaran, kelulusan, dokumen operasi, bukti serahan dan log audit.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Lokasi dan fleet</h2>
 <p>Apabila pengguna menjalankan tugasan penghantaran atau fleet, aplikasi boleh meminta lokasi peranti untuk menyusun laluan, mengesahkan hentian dan merekod bukti serahan. Data lokasi kenderaan syarikat juga boleh diterima daripada penyedia telematik yang diluluskan. Akses lokasi peranti tertakluk kepada kebenaran pengguna dan digunakan untuk operasi syarikat.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Tujuan penggunaan</h2>
 <p>Data digunakan untuk pengesahan pengguna, kawalan akses, audit operasi, pengiraan stok, pemantauan tugasan, keselamatan, pematuhan, penyediaan laporan dan pengurusan tenaga kerja. Data tidak dijual atau digunakan untuk pengiklanan pihak ketiga.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Perkongsian dan pemproses</h2>
 <p>Data hanya dikongsi dengan kakitangan yang dibenarkan dan penyedia perkhidmatan yang diperlukan untuk hos aplikasi, pangkalan data, pembayaran, pemetaan, navigasi atau telematik. Setiap akses tertakluk kepada tujuan operasi, peranan pengguna dan kawalan keselamatan.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Keselamatan dan penyimpanan</h2>
 <p>RKJ One menggunakan akses berasaskan peranan, sambungan HTTPS, rekod audit dan kawalan sesi. Data disimpan selama diperlukan untuk operasi, audit, keselamatan serta kewajipan undang-undang atau kewangan, kemudian dipadam atau dinyahkenal mengikut dasar syarikat.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Hak pengguna</h2>
 <p>Pengguna boleh meminta akses, pembetulan, penyahaktifan atau pemadaman data yang layak. Arahan lengkap tersedia pada halaman Padam Akaun. Sebahagian rekod pekerjaan, kewangan atau audit mungkin perlu dikekalkan apabila diwajibkan oleh undang-undang atau kepentingan operasi yang sah.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Hubungi kami</h2>
 <p>Pertanyaan privasi boleh dihantar kepada <a className="font-semibold text-[#6b5319] underline" href="mailto:developer@rkj.one">developer@rkj.one</a> atau melalui pentadbir RKJ One yang dilantik oleh syarikat.</p>
 </section>
 </PublicInfoShell>);
}
