const AUTH_ERROR_BM: Record<string, string> = {
  'Invalid login credentials': 'Email atau kata laluan tidak betul.',
  'Email not confirmed': 'Email belum disahkan — hubungi admin HQ.',
  'Too many requests': 'Terlalu banyak percubaan — cuba lagi sebentar.',
};

export function mapAuthError(message: string): string {
  return AUTH_ERROR_BM[message] ?? message;
}

export function safeRedirectPath(path: string | null): string {
  const redirect = path ?? '/dashboard';
  if (redirect.startsWith('/') && !redirect.startsWith('//') && !redirect.includes('://')) {
    return redirect;
  }
  return '/dashboard';
}
