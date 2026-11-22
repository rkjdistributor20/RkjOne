import { describe, expect, it, vi } from 'vitest';
import { readBrowserStorageItem } from './browser-storage';

describe('browser storage recovery fallback', () => {
 it('prefers a durable local value', () => {
  const sessionGet = vi.fn(() => 'session-copy');
  expect(readBrowserStorageItem('payment', {
   localStorage: { getItem: () => 'local-copy' },
   sessionStorage: { getItem: sessionGet },
  })).toBe('local-copy');
  expect(sessionGet).not.toHaveBeenCalled();
 });

 it('reads the session marker when localStorage access throws', () => {
  expect(readBrowserStorageItem('payment', {
   localStorage: { getItem: () => { throw new Error('denied'); } },
   sessionStorage: { getItem: () => 'session-copy' },
  })).toBe('session-copy');
 });

 it('returns null only after both storage readers fail', () => {
  expect(readBrowserStorageItem('payment', {
   localStorage: { getItem: () => { throw new Error('local denied'); } },
   sessionStorage: { getItem: () => { throw new Error('session denied'); } },
  })).toBeNull();
 });
});
