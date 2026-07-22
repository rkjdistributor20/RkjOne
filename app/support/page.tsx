import type { Metadata } from 'next';

import { PublicInfoShell } from '@/components/public/public-info-shell';

export const metadata: Metadata = {
 title: 'Sokongan',
 description: 'Saluran sokongan rasmi untuk pengguna RKJ One Staff.',
};

export default function SupportPage() {
 return (
 <PublicInfoShell
 eyebrow="Pusat Bantuan"
 title="Sokongan RKJ One"
 intro="Bantuan untuk akaun, akses, operasi cawangan, POS, HR, fleet dan penggunaan aplikasi RKJ One Staff."
 >
 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Bantuan segera</h2>
 <p>
 Jika isu menghalang operasi semasa, maklumkan kepada pengurus atau pentadbir RKJ One dan sertakan nama, ID staf, cawangan, masa kejadian serta tangkap layar. Jangan sertakan kata laluan, OTP, kunci API atau maklumat kad pembayaran.
 </p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Hubungi sokongan</h2>
 <p>E-mel: <a className="font-semibold text-[#6b5319] underline" href="mailto:developer@rkj.one?subject=Sokongan%20RKJ%20One">developer@rkj.one</a></p>
 <p>Telefon syarikat: <a className="font-semibold text-[#6b5319] underline" href="tel:+60164366302">+60 16-436 6302</a></p>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Maklumat yang membantu siasatan</h2>
 <ul className="list-disc space-y-1 pl-5">
 <li>Nama modul dan tindakan terakhir sebelum masalah berlaku.</li>
 <li>Jenis telefon, versi sistem operasi dan versi aplikasi.</li>
 <li>Mesej ralat, masa kejadian dan keadaan sambungan internet.</li>
 <li>Nombor rujukan transaksi atau tugasan tanpa mendedahkan data sensitif.</li>
 </ul>
 </section>

 <section className="space-y-2">
 <h2 className="text-xl font-bold text-[#14120f]">Keselamatan akaun</h2>
 <p>Pentadbir tidak akan meminta kata laluan penuh atau OTP. Jika akaun disyaki digunakan orang lain, hentikan penggunaan, maklumkan pengurus dan minta sesi serta kata laluan ditetapkan semula.</p>
 </section>
 </PublicInfoShell>);
}
