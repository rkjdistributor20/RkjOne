'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Flame, MapPin, Store } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { mapAuthError, safeRedirectPath } from '@/lib/auth/errors';
import { COMPANY, BRAND_COLORS } from '@/lib/brand/company';
import { BrandLogo } from '@/components/brand/brand-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get('redirect'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(mapAuthError(authError.message));
      setLoading(false);
      return;
    }

    window.location.href = redirect;
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className="relative hidden w-[46%] overflow-hidden lg:flex lg:flex-col lg:justify-between"
        style={{ backgroundColor: BRAND_COLORS.black }}
      >
        <div
          className="absolute inset-0 opacity-50"
          style={{
            backgroundImage: `radial-gradient(circle at 15% 85%, ${BRAND_COLORS.gold}33 0%, transparent 50%), radial-gradient(circle at 85% 15%, ${BRAND_COLORS.goldBright}22 0%, transparent 45%)`,
          }}
          aria-hidden
        />
        <div className="relative p-10 xl:p-12">
          <BrandLogo layout="sign" size="xl" />
          <div className="mt-10 space-y-4">
            <p
              className="text-sm font-bold uppercase tracking-[0.2em]"
              style={{ color: BRAND_COLORS.gold }}
            >
              Sejak {COMPANY.founded} · {COMPANY.hq}
            </p>
            <h1 className="max-w-md text-3xl font-bold leading-tight text-white xl:text-4xl">
              &ldquo;{COMPANY.tagline}&rdquo;
            </h1>
            <p className="max-w-md text-base leading-relaxed text-white/80">
              {COMPANY.taglineMs}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap gap-2">
            {COMPANY.products.map((p) => (
              <span
                key={p.name}
                className="rounded-full border px-3 py-1 text-xs font-medium text-white"
                style={{
                  borderColor: `${BRAND_COLORS.gold}55`,
                  backgroundColor: `${BRAND_COLORS.gold}18`,
                }}
              >
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <div
          className="relative space-y-4 border-t p-10 xl:p-12"
          style={{ borderColor: `${BRAND_COLORS.gold}33` }}
        >
          {COMPANY.highlights.map((line) => (
            <div key={line} className="flex gap-3 text-sm text-white/75">
              <Flame className="mt-0.5 h-4 w-4 shrink-0" style={{ color: BRAND_COLORS.gold }} />
              <span>{line}</span>
            </div>
          ))}
          <div className="flex flex-wrap gap-6 pt-2 text-xs text-white/50">
            <span className="flex items-center gap-1.5">
              <Store className="h-3.5 w-3.5" />
              {COMPANY.branchCount} cawangan kiosk
            </span>
            <span className="flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" />
              {COMPANY.regions.join(' · ')}
            </span>
          </div>
        </div>
      </aside>

      <div
        className="flex flex-1 items-center justify-center p-4 sm:p-8"
        style={{
          background: `linear-gradient(to bottom right, ${BRAND_COLORS.cream}, white, ${BRAND_COLORS.goldLight})`,
        }}
      >
        <Card className="w-full max-w-md border bg-white/95 shadow-xl backdrop-blur-sm" style={{ borderColor: `${BRAND_COLORS.gold}44` }}>
          <CardHeader className="space-y-4 text-center">
            <div className="lg:hidden">
              <BrandLogo size="lg" className="justify-center" />
            </div>
            <div className="hidden lg:block">
              <CardTitle className="text-2xl" style={{ color: BRAND_COLORS.black }}>
                Log Masuk
              </CardTitle>
              <CardDescription className="text-base">
                Portal dalaman {COMPANY.name}
              </CardDescription>
            </div>
            <div className="lg:hidden">
              <CardTitle className="text-xl" style={{ color: BRAND_COLORS.black }}>
                Log Masuk Staff
              </CardTitle>
              <CardDescription>
                {COMPANY.systemName} · {COMPANY.hq}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="matisa@rkj.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Kata Laluan</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? 'Sedang log masuk…' : 'Log Masuk ke RKJ One'}
              </Button>
            </form>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {COMPANY.name} · Sistem dalaman syarikat · {COMPANY.branchCount} cawangan
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
