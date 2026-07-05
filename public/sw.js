const CACHE_NAME = 'rkj-one-app-shell-v1';
const STATIC_ASSETS = [
 '/offline',
 '/manifest.json',
 '/app-icon-192.png',
 '/app-icon-512.png',
 '/app-icon-maskable-192.png',
 '/app-icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
 event.waitUntil(
 caches
 .open(CACHE_NAME)
 .then((cache) => cache.addAll(STATIC_ASSETS))
 .then(() => self.skipWaiting()),
 );
});

self.addEventListener('activate', (event) => {
 event.waitUntil(
 caches
 .keys()
 .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
 .then(() => self.clients.claim()),
 );
});

function isSensitivePath(pathname) {
 return (
 pathname.startsWith('/api/') ||
 pathname.startsWith('/auth/') ||
 pathname.startsWith('/login') ||
 pathname.startsWith('/dashboard') ||
 pathname.startsWith('/pos') ||
 pathname.startsWith('/branches') ||
 pathname.startsWith('/factory') ||
 pathname.startsWith('/fleet') ||
 pathname.startsWith('/finance') ||
 pathname.startsWith('/hr') ||
 pathname.startsWith('/inventory') ||
 pathname.startsWith('/maintenance') ||
 pathname.startsWith('/payroll') ||
 pathname.startsWith('/profile') ||
 pathname.startsWith('/reports') ||
 pathname.startsWith('/sales-agent') ||
 pathname.startsWith('/settings') ||
 pathname.startsWith('/shifts') ||
 pathname.startsWith('/warehouse')
 );
}

self.addEventListener('fetch', (event) => {
 const { request } = event;
 if (request.method !== 'GET') return;

 const url = new URL(request.url);
 if (url.origin !== self.location.origin) return;

 if (request.mode === 'navigate') {
 event.respondWith(
 fetch(request).catch(() => caches.match('/offline')),
 );
 return;
 }

 if (isSensitivePath(url.pathname)) return;

 if (
 url.pathname.startsWith('/_next/static/') ||
 url.pathname.startsWith('/brand/') ||
 url.pathname.endsWith('.png') ||
 url.pathname.endsWith('.jpg') ||
 url.pathname.endsWith('.jpeg') ||
 url.pathname.endsWith('.webp') ||
 url.pathname.endsWith('.svg') ||
 url.pathname === '/manifest.json'
 ) {
 event.respondWith(
 caches.match(request).then((cached) => {
 if (cached) return cached;
 return fetch(request).then((response) => {
 if (!response || response.status !== 200) return response;
 const clone = response.clone();
 caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
 return response;
 });
 }),
 );
 }
});
