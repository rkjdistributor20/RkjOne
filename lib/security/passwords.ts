import { randomBytes } from 'crypto';

export function generateTemporaryPassword(prefix = 'RkjOne') {
 const token = randomBytes(8).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10);
 return `${prefix}@${new Date().getFullYear()}-${token}aA1!`;
}
