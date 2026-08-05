import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
 appId: 'com.rkjone.staff',
 appName: 'RKJ One Staff',
 webDir: 'mobile-fallback',
 server: {
 url: 'https://rkj.one',
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
