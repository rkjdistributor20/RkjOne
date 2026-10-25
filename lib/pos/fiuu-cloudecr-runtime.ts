import {
 createFiuuCloudEcrSale,
 ensureFiuuCloudEcrAuth,
 getFiuuCloudEcrConfig,
 getFiuuCloudEcrLast,
 isFiuuCloudEcrProviderError,
 listFiuuCloudEcrEwalletChannels,
 listFiuuCloudEcrTerminals,
 loginFiuuCloudEcr,
 logoutFiuuCloudEcr,
 refreshFiuuCloudEcr,
 type FiuuCloudEcrConfig,
 type FiuuCloudEcrEwalletChannel,
 type FiuuCloudEcrFetch,
 type FiuuCloudEcrResponse,
 type FiuuCloudEcrTerminal,
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
 return isFiuuCloudEcrProviderError(error)
  && (error.status === 401 || error.code?.startsWith('401') === true);
}

function isActiveSession(error: unknown): boolean {
 return isFiuuCloudEcrProviderError(error) && error.code === '40314';
}

async function logoutKnownSession(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 current: FiuuCloudEcrTokens;
}): Promise<boolean> {
 try {
  await logoutFiuuCloudEcr(
   input.config,
   input.current.access.token,
   input.fetcher,
  );
  return true;
 } catch (error) {
  if (isUnauthorized(error)) return false;
  throw error;
 }
}

async function loginWithActiveSessionRecovery(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 current?: FiuuCloudEcrTokens | null;
}): Promise<FiuuCloudEcrTokens> {
 try {
  return await loginFiuuCloudEcr(input.config, input.fetcher);
 } catch (error) {
  if (!isActiveSession(error) || !input.current) throw error;
  const loggedOut = await logoutKnownSession({
   config: input.config,
   fetcher: input.fetcher,
   current: input.current,
  });
  // Without a usable known token there is no safe API mechanism to terminate
  // another process's session. Preserve the actionable 40314 in that case.
  if (!loggedOut) throw error;
  return loginFiuuCloudEcr(input.config, input.fetcher);
 }
}

async function recoverAuthorization(input: {
 config: FiuuCloudEcrConfig;
 fetcher: FiuuCloudEcrFetch;
 current?: FiuuCloudEcrTokens | null;
}): Promise<FiuuCloudEcrTokens> {
 if (input.current) {
  // Try the known refresh token once even if its local timestamp has just
  // elapsed; this avoids creating a second provider session due to clock skew.
  try {
   return await refreshFiuuCloudEcr(
    input.config,
    input.current.refresh.token,
    input.fetcher,
   );
  } catch (error) {
   if (!isUnauthorized(error)) throw error;
  }
 }
 return loginWithActiveSessionRecovery(input);
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
 const authorize = async (
  forceRecovery = false,
  fallbackCurrent?: FiuuCloudEcrTokens | null,
 ): Promise<FiuuCloudEcrTokens> => {
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
   const current = cache.get(key) ?? fallbackCurrent;
   try {
    const next = forceRecovery
     ? await recoverAuthorization({ config, fetcher, current })
     : await ensureFiuuCloudEcrAuth({ config, fetcher, current });
    cache.set(key, next);
    return next;
   } catch (error) {
    if (forceRecovery
     || !current
     || (!isUnauthorized(error) && !isActiveSession(error))) throw error;
    cache.delete(key);
    const next = isUnauthorized(error)
     ? await loginWithActiveSessionRecovery({ config, fetcher, current })
     : await recoverAuthorization({ config, fetcher, current });
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
  tokens = await authorize(true, tokens);
  try {
   return await input.operation(config, tokens.access.token);
  } catch (retryError) {
   if (isUnauthorized(retryError)) cache.delete(key);
   throw retryError;
  }
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

export async function fetchFiuuCloudEcrTerminals(input: {
 fetcher?: FiuuCloudEcrFetch;
} = {}): Promise<readonly FiuuCloudEcrTerminal[]> {
 return withAuthorizedCloudEcr({
  fetcher: input.fetcher,
  operation: (config, accessToken) => listFiuuCloudEcrTerminals({
   config,
   fetcher: input.fetcher ?? fetch,
   accessToken,
  }),
 });
}

export async function fetchFiuuCloudEcrEwalletChannels(input: {
 currency?: 'MYR';
 fetcher?: FiuuCloudEcrFetch;
} = {}): Promise<readonly FiuuCloudEcrEwalletChannel[]> {
 return withAuthorizedCloudEcr({
  fetcher: input.fetcher,
  operation: (config, accessToken) => listFiuuCloudEcrEwalletChannels({
   config,
   fetcher: input.fetcher ?? fetch,
   accessToken,
   currency: input.currency,
  }),
 });
}

export function clearFiuuCloudEcrRuntimeTokens(): void {
 tokenCache().clear();
 authPromiseCache().clear();
}
