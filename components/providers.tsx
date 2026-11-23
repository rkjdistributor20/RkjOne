'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { PwaRegistration } from '@/components/pwa/pwa-registration';
import { ReleaseFreshnessController } from '@/components/pwa/release-freshness-controller';
import { LanguageProvider } from '@/components/i18n/language-provider';
import { LegacyTranslationBridge } from '@/components/i18n/legacy-translation-bridge';
import { WebVitalsReporter } from '@/components/performance/web-vitals-reporter';
import type { ReleaseMetadata } from '@/lib/pwa/release-freshness';

export function Providers({
 children,
 currentRelease,
}: {
 children: ReactNode;
 currentRelease: ReleaseMetadata;
}) {
 const [queryClient] = useState(
 () =>
 new QueryClient({
 defaultOptions: {
 queries: {
 staleTime: 90 * 1000,
 gcTime: 10 * 60 * 1000,
 refetchOnWindowFocus: false,
 refetchOnReconnect: false,
 retry: 1,
 },
 },
 }));

 return (
 <QueryClientProvider client={queryClient}>
 <LanguageProvider>
 <PwaRegistration />
 <ReleaseFreshnessController currentRelease={currentRelease} />
 <WebVitalsReporter />
 <LegacyTranslationBridge />
 {children}
 <Toaster richColors position="top-right" />
 </LanguageProvider>
 </QueryClientProvider>);
}
