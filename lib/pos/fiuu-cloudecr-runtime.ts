import {
 createFiuuCloudEcrSale,
 ensureFiuuCloudEcrAuth,
 getFiuuCloudEcrConfig,
 getFiuuCloudEcrLast,
 type FiuuCloudEcrConfig,
 type FiuuCloudEcrFetch,
 type FiuuCloudEcrResponse,
 type FiuuCloudEcrTokens,
} from './fiuu-cloudecr';

type RuntimeCache = Map<string, FiuuCloudEcrTokens>;
type AuthPromiseCache = Map<string, Promise<FiuuCloudEcrTokens>>;

const globalRuntime = globalThis as typeof globalThis & {
 __rkjFiuuCloudEcrTokens?: RuntimeCache;
 __rkjFiuuCloudEcrAuthPromises?: AuthPromiseCache;
};

function tokenCache(): RuntimeCache {
 globalRuntime.__rkjFiuuCloudEcrTokens ??= new Map();
 return globalRuntime.__rkjFiuuCloudEcrTokens;
}

function authPromiseCache(): AuthPromiseCache {
 globalRuntime.__rkjFiuuCloudEcrAuthPromises ??= new Map();
 return globalRuntime.__rkjFiuuCloudEcrAuthPromises;
}

function cacheKey(config: FiuuCloudEcrConfig): string {
 return `${config.baseUrl}|${config.posId}`;
}

function isUnauthorized(error: unknown): boolean {
 return error instanceof Error && /\(401\)/.test(error.message);
}

async function withAuthorizedCloudEcr<T>(input: {
 fetcher?: FiuuCloudEcrFetch;
 operation: (config: FiuuCloudEcrConfig, accessToken: string) => Promise<T>;
}): Promise<T> {
 const config = getFiuuCloudEcrConfig();
 const fetcher = input.fetcher ?? fetch;
 const key = cacheKey(config);
 const cache = tokenCache();
 const pending = authPromiseCache();
 const authorize = async (forceLogin = false): Promise<FiuuCloudEcrTokens> => {
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
   const current = forceLogin ? null : cache.get(key);
   try {
    const next = await ensureFiuuCloudEcrAuth({ config, fetcher, current });
    cache.set(key, next);
    return next;
   } catch (error) {
    if (!current || !isUnauthorized(error)) throw error;
    cache.delete(key);
    const next = await ensureFiuuCloudEcrAuth({ config, fetcher });
    cache.set(key, next);
    return next;
   }
  })();
  pending.set(key, promise);
  try {
   return await promise;
  } finally {
   if (pending.get(key) === promise) pending.delete(key);
  }
 };
 let tokens = await authorize();
 try {
  return await input.operation(config, tokens.access.token);
 } catch (error) {
  if (!isUnauthorized(error)) throw error;
  cache.delete(key);
  tokens = await authorize(true);
  return input.operation(config, tokens.access.token);
 }
}

export async function sendFiuuCloudEcrSale(input: {
 referenceId: string;
 amountRm: number;
 note?: string;
 fetcher?: FiuuCloudEcrFetch;
}): Promise<FiuuCloudEcrResponse> {
 return withAuthorizedCloudEcr({
  fetcher: input.fetcher,
  operation: (config, accessToken) => createFiuuCloudEcrSale({
   config,
   fetcher: input.fetcher ?? fetch,
   accessToken,
   referenceId: input.referenceId,
   amountRm: input.amountRm,
   note: input.note,
  }),
 });
}

export async function reconcileFiuuCloudEcrLast(input: {
 queryReferenceId: string;
 originalReferenceId: string;
 amountRm: number;
 fetcher?: FiuuCloudEcrFetch;
}): Promise<FiuuCloudEcrResponse> {
 return withAuthorizedCloudEcr({
  fetcher: input.fetcher,
  operation: (config, accessToken) => getFiuuCloudEcrLast({
   config,
   fetcher: input.fetcher ?? fetch,
   accessToken,
   queryReferenceId: input.queryReferenceId,
   originalReferenceId: input.originalReferenceId,
   expectedAmountRm: input.amountRm,
  }),
 });
}

export function clearFiuuCloudEcrRuntimeTokens(): void {
 tokenCache().clear();
 authPromiseCache().clear();
}
