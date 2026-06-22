'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  fetchMyProfile,
  updateMyProfile,
  uploadProfileAvatar,
  type ProfileMe,
} from '@/lib/profile/api';
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from '@/lib/profile/requirements';
import { avatarReminderSeed, pickAvatarReminderMessage } from '@/lib/profile/avatar-reminder';
import { ROLE_LABELS } from '@/types/enums';
import { useAuthStore } from '@/stores/auth-store';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function initials(name: string) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export function ProfileSettingsForm() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const setProfile = useAuthStore((s) => s.setProfile);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setLocalProfile] = useState<ProfileMe | null>(null);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const syncStore = useCallback(
    (p: ProfileMe) => {
      setLocalProfile(p);
      setFullName(p.full_name);
      setPhone(p.phone ?? '');
      const current = useAuthStore.getState().profile;
      if (current) {
        setProfile({
          ...current,
          full_name: p.full_name,
          phone: p.phone,
          avatar_url: p.avatar_url,
          must_change_password: p.must_change_password,
        });
      }
    },
    [setProfile]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await fetchMyProfile();
        if (!cancelled) syncStore(p);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Gagal muat profil');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncStore]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateMyProfile({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      syncStore(updated);
      toast.success('Profil dikemas kini');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Gagal simpan');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!AVATAR_MIME_TYPES.includes(file.type as (typeof AVATAR_MIME_TYPES)[number])) {
      toast.error('Format JPG, PNG atau WebP sahaja');
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error('Saiz gambar maksimum 5 MB');
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);

    try {
      const updated = await uploadProfileAvatar(file);
      syncStore(updated);
      toast.success('Gambar profil dikemas kini');
    } catch (err) {
      setPreviewUrl(null);
      toast.error(err instanceof Error ? err.message : 'Gagal muat naik');
    } finally {
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const avatarSrc = previewUrl ?? profile?.avatar_url ?? undefined;
  const needsAvatar = profile?.needs_avatar ?? true;

  const aiReminder = useMemo(() => {
    if (!profile?.id || !needsAvatar) return null;
    return pickAvatarReminderMessage(avatarReminderSeed('/profile', profile.id));
  }, [profile?.id, needsAvatar]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {aiReminder && (
        <div className="rounded-xl border border-violet-200/80 bg-gradient-to-br from-violet-50 via-white to-amber-50/40 p-4">
          <div className="flex gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-violet-700">
                RKJ One AI
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{aiReminder}</p>
            </div>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Profil Saya</CardTitle>
          <CardDescription>
            Kemas kini maklumat peribadi. Gambar muka sebenar digalakkan untuk pengesahan identiti.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <div className="relative">
              <Avatar className="h-28 w-28 ring-4 ring-primary/20" data-size="lg">
                {avatarSrc ? (
                  <AvatarImage src={avatarSrc} alt={profile?.full_name ?? 'Profil'} />
                ) : null}
                <AvatarFallback className="bg-primary/10 text-2xl font-bold text-primary">
                  {profile?.full_name ? initials(profile.full_name) : '?'}
                </AvatarFallback>
              </Avatar>
              <Button
                type="button"
                size="icon"
                variant="secondary"
                className="absolute -bottom-1 -right-1 h-9 w-9 rounded-full shadow-md"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={AVATAR_MIME_TYPES.join(',')}
                className="hidden"
                aria-label="Muat naik gambar profil"
                onChange={handleAvatarPick}
              />
            </div>

            <div className="flex-1 space-y-2 text-center sm:text-left">
              <p className="text-lg font-semibold">{profile?.full_name}</p>
              <p className="text-sm text-muted-foreground">{profile?.email}</p>
              <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                {profile?.role && (
                  <Badge variant="secondary">{ROLE_LABELS[profile.role as keyof typeof ROLE_LABELS]}</Badge>
                )}
                {profile?.employee_code && (
                  <Badge variant="outline">{profile.employee_code}</Badge>
                )}
                {profile?.branch && (
                  <Badge variant="outline">
                    {profile.branch.branch_code} · {profile.branch.branch_name}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG atau WebP · maksimum 5 MB · gambar muka yang jelas
              </p>
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nama Penuh</Label>
              <Input
                id="full_name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                minLength={2}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">No. Telefon</Label>
              <Input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="cth. 012-3456789"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan…
                </>
              ) : (
                'Simpan Profil'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
