/** Mesej AI berputar - ingatkan muat naik gambar muka sebenar (bukan wajib). */

const REMINDER_MESSAGES = [
 'Profil anda belum ada gambar muka. Sila muat naik foto wajah sebenar supaya rakan sekerja dan pengurus dapat mengenali anda.',
 'RKJ One AI: Gambar profil membantu pengesahan identiti di kiosk, syif dan kelulusan. Gunakan foto muka anda yang jelas.',
 'Tip AI - muat naik gambar profil di halaman Profil Saya. Elakkan logo, avatar kartun atau foto orang lain.',
 'Identiti digital: satu gambar muka sebenar memudahkan semakan kehadiran dan komunikasi pasukan.',
 'Peringatan mesra: sistem masih boleh digunakan, tetapi gambar muka anda sangat digalakkan untuk keselamatan operasi.',
] as const;

export function pickAvatarReminderMessage(seed: string): string {
 let hash = 0;
 for (let i = 0; i < seed.length; i++) {
 hash = (hash + seed.charCodeAt(i) * (i + 1)) % REMINDER_MESSAGES.length;
 }
 return REMINDER_MESSAGES[hash] ?? REMINDER_MESSAGES[0];
}

export function avatarReminderSeed(pathname: string, userId: string): string {
 const day = new Date().toISOString().slice(0, 10);
 return `${userId}:${day}:${pathname.split('/')[1] ?? 'home'}`;
}
