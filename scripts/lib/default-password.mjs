/** Credentials must be supplied at runtime and must never be committed. */
export const DEFAULT_PASSWORD = process.env.RKJ_INITIAL_PASSWORD?.trim() || '';
export const LEGACY_PASSWORD = process.env.RKJ_LEGACY_PASSWORD?.trim() || '';
