"use client";

import { useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { mapAuthError, safeRedirectPath } from "@/lib/auth/errors";
import { COMPANY } from "@/lib/brand/company";
import { BrandLogo } from "@/components/brand/brand-logo";
import { StaffSchedulePanel } from "@/components/shifts/staff-schedule-panel";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";
import { useLanguage } from "@/components/i18n/language-provider";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function LoginForm() {
  const searchParams = useSearchParams();
  const redirect = safeRedirectPath(searchParams.get("redirect"));
  const { t } = useLanguage();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);
  const [isStaffLogin, setIsStaffLogin] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });

    if (authError) {
      setError(mapAuthError(authError.message));
      setLoading(false);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", authData.user?.id ?? "")
      .maybeSingle();

    const deviceResponse = await fetch('/api/pos/device', { cache: 'no-store' });
    if (deviceResponse.ok) {
      const deviceContext = await deviceResponse.json();
      if (deviceContext.mode === 'PRODUCTION') {
        window.location.href = '/pos';
        return;
      }
    }

    if ((profile as { role?: string } | null)?.role === "STAFF") {
      setIsStaffLogin(true);
      setShowSchedule(true);
      setLoading(false);
      return;
    }

    window.location.href = redirect;
  }

  function continueToApp() {
    window.location.href = isStaffLogin ? "/dashboard" : redirect;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#fff8ea_46%,#eefcf6_100%)] text-foreground">
      <div className="grid min-h-screen lg:grid-cols-[minmax(360px,0.85fr)_minmax(560px,1.15fr)]">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#101411_0%,#18130f_54%,#0f1b17_100%)] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="pointer-events-none absolute inset-0 opacity-10 [background-image:linear-gradient(135deg,rgba(255,255,255,0.55)_0_1px,transparent_1px_18px)]" />

          <div className="relative">
            <div className="mb-8 flex justify-end">
              <LanguageSwitcher compact />
            </div>
            <BrandLogo size="lg" variant="light" className="drop-shadow" />
            <div className="mt-16 max-w-md">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#e9b127]">
                {t("login.restrictedAccess")}
              </p>
              <h1 className="mt-4 text-5xl font-semibold leading-tight text-white">
                {COMPANY.systemName}
              </h1>
              <p className="mt-5 text-base leading-7 text-white/75">
                {t("login.heroIntro")}
              </p>
            </div>
          </div>

          <div className="relative grid gap-3">
            <div className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
              <ShieldCheck className="h-5 w-5 text-[#e9b127]" />
              <span>{t("login.secureAccount")}</span>
            </div>
            <div className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
              <LockKeyhole className="h-5 w-5 text-[#e9b127]" />
              <span>{t("login.keepSecret")}</span>
            </div>
            <div className="flex items-center gap-3 rounded-[8px] border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/75">
              <Sparkles className="h-5 w-5 text-[#e9b127]" />
              <span>{t("login.roleBased")}</span>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[480px]">
            <div className="mb-6 flex items-center justify-between gap-3 lg:hidden">
              <BrandLogo size="lg" />
              <LanguageSwitcher compact />
            </div>

            <Card className="overflow-hidden rounded-[8px] border-[#eadfca] bg-white/95 shadow-2xl shadow-[#b8871a]/10">
              <CardHeader className="border-b border-[#efe7d8] px-7 py-7 text-center">
                <div className="mx-auto hidden lg:block">
                  <BrandLogo size="lg" />
                </div>
                <div className="mx-auto mt-2 flex h-11 w-11 items-center justify-center rounded-[8px] bg-[#111111] text-[#e9b127]">
                  <LockKeyhole className="h-5 w-5" />
                </div>
                <CardTitle className="text-3xl font-semibold">
                  {t("login.title")}
                </CardTitle>
                <CardDescription className="text-base">
                  {t("login.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5 px-7 py-7">
                {showSchedule ? (
                  <div className="space-y-4">
                    <div className="rounded-[8px] border border-[#e5dfd5] bg-[#fffbf3] p-4">
                      <div className="mb-3 flex items-center gap-2 text-xl font-semibold">
                        <CalendarDays className="h-5 w-5 text-[#e9b127]" />
                        {t("login.todaySchedule")}
                      </div>
                      <StaffSchedulePanel compact />
                    </div>
                    <Button
                      type="button"
                      onClick={continueToApp}
                      className="h-12 w-full rounded-[8px] bg-[#e9b127] text-base font-semibold text-black hover:bg-[#d19a10]"
                    >
                      {t("login.continueDashboard")}{" "}
                      <ArrowRight className="ml-2 h-5 w-5" />
                    </Button>
                  </div>
                ) : (
                  <form onSubmit={handleLogin} className="space-y-5">
                    <div className="space-y-2">
                      <Label
                        htmlFor="email"
                        className="text-sm font-semibold text-[#3f3528]"
                      >
                        {t("login.email")}
                      </Label>
                      <div className="relative">
                        <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#83786b]" />
                        <Input
                          id="email"
                          type="email"
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                          placeholder={t("login.emailPlaceholder")}
                          required
                          autoComplete="email"
                          className="h-11 rounded-[8px] border-[#e5dfd5] bg-white pl-10 text-base"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="password"
                        className="text-sm font-semibold text-[#3f3528]"
                      >
                        {t("login.password")}
                      </Label>
                      <div className="relative">
                        <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#83786b]" />
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          required
                          autoComplete="current-password"
                          className="h-11 rounded-[8px] border-[#e5dfd5] bg-white pl-10 pr-12 text-base"
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => setShowPassword((value) => !value)}
                          aria-label={
                            showPassword
                              ? t("login.hidePassword")
                              : t("login.showPassword")
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#6b6257] hover:bg-[#f7f1e6]"
                        >
                          {showPassword ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {error ? (
                      <p
                        className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
                        role="alert"
                      >
                        {error}
                      </p>
                    ) : null}

                    <Button
                      type="submit"
                      disabled={loading}
                      className="h-12 w-full rounded-[8px] bg-[#e9b127] text-base font-semibold text-black hover:bg-[#d19a10]"
                    >
                      {loading ? t("login.loading") : t("login.submit")}
                      {!loading ? (
                        <ArrowRight className="ml-2 h-5 w-5" />
                      ) : null}
                    </Button>
                  </form>
                )}

                <p className="pt-2 text-center text-xs text-[#6b6257]">
                  {t("login.registeredOnly")}
                </p>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </main>
  );
}
