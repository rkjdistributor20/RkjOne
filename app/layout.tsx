import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Providers } from '@/components/providers';
import './globals.css';

const geistSans = Geist({
 variable: '--font-geist-sans',
 subsets: ['latin'],
});

const geistMono = Geist_Mono({
 variable: '--font-geist-mono',
 subsets: ['latin'],
});

export const metadata: Metadata = {
 metadataBase: new URL('https://rkj-one.vercel.app'),
 applicationName: 'RKJ One Staff',
 title: {
 default: 'RKJ One Staff',
 template: '%s | RKJ One',
 },
 description: 'Akses rasmi RKJ One untuk pengguna berdaftar. Official RKJ One access for registered users.',
 manifest: '/manifest.json',
 icons: {
 icon: [
 { url: '/app-icon-192.png', sizes: '192x192', type: 'image/png' },
 { url: '/app-icon-512.png', sizes: '512x512', type: 'image/png' },
 ],
 apple: [{ url: '/app-icon-180.png', sizes: '180x180', type: 'image/png' }],
 },
 appleWebApp: {
 capable: true,
 statusBarStyle: 'black-translucent',
 title: 'RKJ One',
 },
 formatDetection: {
 telephone: false,
 email: false,
 address: false,
 },
 other: {
 'mobile-web-app-capable': 'yes',
 'apple-mobile-web-app-capable': 'yes',
 'apple-mobile-web-app-status-bar-style': 'black-translucent',
 },
};

export const viewport: Viewport = {
 themeColor: '#111111',
 width: 'device-width',
 initialScale: 1,
 maximumScale: 1,
 viewportFit: 'cover',
};

export default function RootLayout({
 children,
}: Readonly<{
 children: React.ReactNode;
}>) {
 return (
 <html lang="ms" className={`${geistSans.variable} ${geistMono.variable} h-full`}>
 <body className="min-h-full antialiased">
 <Providers>{children}</Providers>
 <SpeedInsights />
 </body>
 </html>);
}
