import type { CapacitorConfig } from '@capacitor/cli';

const DEFAULT_SERVER_URL = 'https://rkj.one';

function resolveServerUrl(): string {
 const configured = process.env.RKJ_CAPACITOR_SERVER_URL?.trim() || DEFAULT_SERVER_URL;
 const url = new URL(configured);
 const hostname = url.hostname.toLowerCase();
 const approved = hostname === 'rkj.one'
  || hostname.endsWith('.rkj.one')
  || (/^rkj(?:-one)?-[a-z0-9-]+\.vercel\.app$/).test(hostname);
 if (url.protocol !== 'https:' || !approved || url.username || url.password
  || (url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
  throw new Error('RKJ_CAPACITOR_SERVER_URL mesti URL HTTPS RKJ One atau Vercel Preview yang diluluskan');
 }
 return url.origin;
}

const config: CapacitorConfig = {
 appId: 'com.rkjone.staff',
 appName: 'RKJ One Staff',
 webDir: 'mobile-fallback',
 server: {
 url: resolveServerUrl(),
 cleartext: false,
 },
 plugins: {
 SplashScreen: {
 launchAutoHide: true,
 backgroundColor: '#111111',
 androidScaleType: 'CENTER_CROP',
 showSpinner: false,
 splashFullScreen: true,
 splashImmersive: true,
 },
 SystemBars: {
 insetsHandling: 'css',
 style: 'DARK',
 hidden: false,
 animation: 'NONE',
 },
 },
 android: {
 allowMixedContent: false,
 captureInput: true,
 webContentsDebuggingEnabled: false,
 },
};

export default config;
