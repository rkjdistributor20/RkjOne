const BYPASS_DURATION_MS = 15 * 60 * 1000;

function signingSecret() {
 const secret = process.env.POS_KIOSK_SIGNING_SECRET || process.env.JWT_SECRET;
 if (!secret) throw new Error('Kiosk signing secret is not configured');
 return secret;
}

function bytesToBase64Url(bytes: Uint8Array) {
 let binary = '';
 for (const byte of bytes) binary += String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value: string) {
 const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
 const binary = atob(padded);
 return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function signingKey() {
 return crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(signingSecret()),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
 );
}

export async function createKioskBypassToken(userId: string) {
 const expiresAt = Date.now() + BYPASS_DURATION_MS;
 const payload = `${userId}.${expiresAt}`;
 const signature = await crypto.subtle.sign(
  'HMAC',
  await signingKey(),
  new TextEncoder().encode(payload),
 );
 return `${payload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifyKioskBypassToken(token: string | undefined, userId: string) {
 if (!token) return false;
 const parts = token.split('.');
 if (parts.length !== 3 || parts[0] !== userId) return false;

 const expiresAt = Number(parts[1]);
 if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;

 const payload = `${parts[0]}.${parts[1]}`;
 try {
  return crypto.subtle.verify(
   'HMAC',
   await signingKey(),
   base64UrlToBytes(parts[2]),
   new TextEncoder().encode(payload),
  );
 } catch {
  return false;
 }
}
