type ClientJsonCacheOptions = {
 ttlMs?: number;
 dedupe?: boolean;
 cacheKey?: string;
};

type CacheEntry = {
 expiresAt: number;
 data: unknown;
};

const responseCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<unknown>>();

function getMethod(init?: RequestInit) {
 return (init?.method ?? 'GET').toUpperCase();
}

function cacheKey(url: string, method: string, options?: ClientJsonCacheOptions) {
 return options?.cacheKey ?? `${method}:${url}`;
}

function hasReusableBrowserCache(ttlMs: number | undefined, method: string) {
 return typeof window !== 'undefined' && method === 'GET' && Number(ttlMs) > 0;
}

function buildHeaders(init?: RequestInit) {
 const headers = new Headers(init?.headers);
 const body = init?.body;
 const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

 if (body && !isFormData && !headers.has('Content-Type')) {
 headers.set('Content-Type', 'application/json');
 }

 return headers;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
 const text = await response.text();
 const data = text ? JSON.parse(text) : {};

 if (!response.ok) {
 const message =
 typeof data?.error === 'string'
 ? data.error
 : typeof data?.message === 'string'
 ? data.message
 : `Request failed (${response.status})`;
 throw new Error(message);
 }

 return data as T;
}

async function executeFetch<T>(url: string, init?: RequestInit): Promise<T> {
 const response = await fetch(url, {
 credentials: 'same-origin',
 ...init,
 headers: buildHeaders(init),
 });

 return parseJsonResponse<T>(response);
}

export function clearClientJsonCache(prefix?: string) {
 if (!prefix) {
 responseCache.clear();
 inflightRequests.clear();
 return;
 }

 for (const key of responseCache.keys()) {
 if (key.includes(prefix)) responseCache.delete(key);
 }

 for (const key of inflightRequests.keys()) {
 if (key.includes(prefix)) inflightRequests.delete(key);
 }
}

export async function fetchJson<T>(
 url: string,
 init?: RequestInit,
 options?: ClientJsonCacheOptions): Promise<T> {
 const method = getMethod(init);
 const key = cacheKey(url, method, options);
 const ttlMs = options?.ttlMs ?? 0;
 const canReuse = hasReusableBrowserCache(ttlMs, method);
 const dedupe = options?.dedupe ?? true;

 if (method !== 'GET') {
 const data = await executeFetch<T>(url, init);
 clearClientJsonCache();
 return data;
 }

 if (canReuse) {
 const cached = responseCache.get(key);
 if (cached && cached.expiresAt > Date.now()) return cached.data as T;
 }

 if (dedupe) {
 const inflight = inflightRequests.get(key);
 if (inflight) return inflight as Promise<T>;
 }

 const request = executeFetch<T>(url, init)
 .then((data) => {
 if (canReuse) {
 responseCache.set(key, {
 data,
 expiresAt: Date.now() + ttlMs,
 });
 }
 return data;
 })
 .finally(() => {
 inflightRequests.delete(key);
 });

 if (dedupe) inflightRequests.set(key, request);
 return request;
}
