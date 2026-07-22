import type { Metadata } from 'next';

import { PublicInfoShell } from '@/components/public/public-info-shell';

export const metadata: Metadata = {
 title: 'Pemadaman Akaun',
 description: 'Cara meminta penyahaktifan akaun dan pemadaman data RKJ One Staff.',
};

export default function DeleteAccountPage() {
 return (
 <PublicInfoShell
 eyebrow="Privasi Pengguna"
 title="Pemadaman Akaun"
 intro="Akaun RKJ One diwujudkan oleh syarikat untuk tujuan kerja. Pengguna boleh meminta akaun dinyahaktifkan dan data yang layak dipadam."
 >
 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Cara membuat permintaan</h2>
 <ol className="list-decimal space-y-2 pl-5">
 <li>Hantar e-mel daripada alamat yang didaftarkan kepada <a className="font-semibold text-[#6b5319] underline" href="mailto:developer@rkj.one?subject=Permintaan%20Pemadaman%20Akaun%20RKJ%20One">developer@rkj.one</a>.</li>
 <li>Gunakan tajuk “Permintaan Pemadaman Akaun RKJ One”.</li>
 <li>Sertakan nama penuh, ID staf dan syarikat atau cawangan. Jangan hantar kata laluan atau OTP.</li>
 <li>Pentadbir akan mengesahkan identiti dan kuasa pemohon sebelum memproses permintaan.</li>
 </ol>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Apa yang akan berlaku</h2>
 <p>Akaun akan disekat daripada log masuk, sesi aktif ditamatkan dan data profil yang tidak lagi diperlukan akan dipadam atau dinyahkenal. Permintaan yang sah biasanya diproses dalam masa 30 hari selepas pengesahan identiti selesai.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Rekod yang mungkin dikekalkan</h2>
 <p>Rekod transaksi, gaji, cukai, keselamatan, kelulusan, penghantaran dan audit mungkin dikekalkan untuk tempoh yang diperlukan oleh undang-undang, pematuhan, penyelesaian pertikaian atau keselamatan operasi. Akses kepada rekod tersebut kekal terhad kepada pihak yang diberi kuasa.</p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Akaun staf aktif</h2>
 <p>Jika pengguna masih bekerja atau mempunyai tugasan belum selesai, pihak HR atau pengurusan mungkin perlu menyelesaikan proses keluar kerja dan pemindahan tugasan sebelum pemadaman penuh.</p>
 </section>
 </PublicInfoShell>);
}
