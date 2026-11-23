const PUBLIC_API_PATHS = new Set([
 '/api/health',
 '/api/release',
 '/api/auth/login',
 // Vercel Cron has no Supabase user session. This exact endpoint performs
 // its own fail-closed Authorization: Bearer CRON_SECRET validation.
 '/api/cron/fiuu-vt-recover',
 '/api/pos/qr-payments/webhook',
 '/api/sales-agent/payments/webhook',
 '/api/sales-agent/payments/fiuu/webhook',
 '/api/sales-agent/payments/fiuu/return',
]);

export function isPublicApiPath(pathname: string): boolean {
 return PUBLIC_API_PATHS.has(pathname);
}
