'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
 useEffect(() => {
 if (process.env.NODE_ENV !== 'production') return;
 if (!('serviceWorker' in navigator)) return;

 const register = () => {
 navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
 // App remains fully usable in the browser if service worker registration fails.
 });
 };

 if (document.readyState === 'complete') {
 register();
 return;
 }

 window.addEventListener('load', register, { once: true });
 return () => window.removeEventListener('load', register);
 }, []);

 return null;
}
