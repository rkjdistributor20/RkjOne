'use client';

import { useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { avatarReminderSeed, pickAvatarReminderMessage } from '@/lib/profile/avatar-reminder';
import { profileNeedsAvatar } from '@/lib/profile/requirements';
import { useAuthStore } from '@/stores/auth-store';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** Banner + toast AI - sentiasa ingatkan jika tiada gambar muka (tanpa halang akses). */
export function ProfileAvatarReminder() {
 const pathname = usePathname();
 const profile = useAuthStore((s) => s.profile);
 const lastToastPath = useRef<string | null>(null);

 const needsAvatar = profileNeedsAvatar(profile);
 const onProfilePage = pathname === '/profile' || pathname.startsWith('/profile/');

 const message = useMemo(() => {
 if (!profile?.id) return REMINDER_FALLBACK;
 return pickAvatarReminderMessage(avatarReminderSeed(pathname, profile.id));
 }, [pathname, profile?.id]);

 useEffect(() => {
 if (!needsAvatar || onProfilePage || !profile?.id) return;
 if (lastToastPath.current === pathname) return;
 lastToastPath.current = pathname;

 toast.message('RKJ One AI - Gambar profil', {
 description: message,
 duration: 8000,
 action: {
 label: 'Muat naik',
 onClick: () => {
 window.location.href = '/profile';
 },
 },
 });
 }, [needsAvatar, onProfilePage, pathname, message, profile?.id]);

 if (!needsAvatar || onProfilePage) return null;

 return (
 <div
 role="status"
 className="border-b border-[#E5A812]/30 bg-gradient-to-r from-[#FFF4D6]/80 via-white to-[#FAFAFA] px-4 py-3 md:px-6"
 >
 <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
 <div className="flex gap-3">
 <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#E5A812] text-[#141414] shadow-sm">
 <Sparkles className="h-4 w-4" />
 </div>
 <div className="min-w-0">
 <p className="text-xs font-semibold uppercase tracking-wider text-primary">
 Peringatan AI - Gambar Profil
 </p>
 <p className="mt-0.5 text-sm text-foreground/90">{message}</p>
 </div>
 </div>
 <Link
 href="/profile"
 className={cn(
 buttonVariants({ size: 'sm' }),
 'shrink-0 bg-[#E5A812] text-[#141414] hover:bg-[#F0C030]')}
 >
 Muat Naik Gambar Muka
 <ArrowRight className="ml-1.5 h-4 w-4" />
 </Link>
 </div>
 </div>);
}

const REMINDER_FALLBACK =
 'Sila muat naik gambar muka sebenar anda di halaman Profil Saya.';
