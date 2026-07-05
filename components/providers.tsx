'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import { PwaRegistration } from '@/components/pwa/pwa-registration';
import { LanguageProvider } from '@/components/i18n/language-provider';
import { LegacyTranslationBridge } from '@/components/i18n/legacy-translation-bridge';

export function Providers({ children }: { children: ReactNode }) {
 const [queryClient] = useState(
 () =>
 new QueryClient({
 defaultOptions: {
 queries: {
 staleTime: 60 * 1000,
 refetchOnWindowFocus: false,
 },
 },
 }));

 return (
 <QueryClientProvider client={queryClient}>
 <LanguageProvider>
 <PwaRegistration />
 <LegacyTranslationBridge />
 {children}
 <Toaster richColors position="top-right" />
 </LanguageProvider>
 </QueryClientProvider>);
}
