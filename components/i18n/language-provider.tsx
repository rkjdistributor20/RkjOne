'use client';

import {
 createContext,
 useCallback,
 useContext,
 useEffect,
 useMemo,
 useState,
 type ReactNode,
} from 'react';
import {
 DEFAULT_LOCALE,
 type Locale,
 type TranslationKey,
 normalizeLocale,
 translate,
} from '@/lib/i18n/dictionary';

type LanguageContextValue = {
 locale: Locale;
 setLocale: (locale: Locale) => void;
 t: (key: TranslationKey) => string;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'rkj-one-locale';

export function LanguageProvider({ children }: { children: ReactNode }) {
 const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

 useEffect(() => {
 const stored = typeof window !== 'undefined'
 ? window.localStorage.getItem(STORAGE_KEY)
 : null;
 const nextLocale = normalizeLocale(stored);
 setLocaleState(nextLocale);
 document.documentElement.lang = nextLocale;
 }, []);

 const setLocale = useCallback((nextLocale: Locale) => {
 const safeLocale = normalizeLocale(nextLocale);
 setLocaleState(safeLocale);
 if (typeof window !== 'undefined') {
 window.localStorage.setItem(STORAGE_KEY, safeLocale);
 document.documentElement.lang = safeLocale;
 }
 }, []);

 const value = useMemo<LanguageContextValue>(() => ({
 locale,
 setLocale,
 t: (key) => translate(locale, key),
 }), [locale, setLocale]);

 return (
 <LanguageContext.Provider value={value}>
 {children}
 </LanguageContext.Provider>);
}

export function useLanguage() {
 const context = useContext(LanguageContext);
 if (!context) {
 throw new Error('useLanguage must be used inside LanguageProvider');
 }
 return context;
}
