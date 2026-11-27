const awaiting = new Map<string, string>();

// Keep only a hash and a random id in session storage. If the connection
// drops after a commit, sending the same form in this tab (even after a reload)
// reuses its id. A confirmed response ends the operation.
export async function withStockOperationId<T>(
 operation: 'receive' | 'adjustment',
 body: string,
 send: (id: string) => Promise<T>,
): Promise<T> {
 const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
 const fingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
 const slot = `rkj-am-stock:${operation}:${fingerprint}`;
 let id = awaiting.get(slot);
 try { id ??= globalThis.sessionStorage?.getItem(slot) ?? undefined; } catch { /* storage unavailable */ }
 if (!id || !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)) id = globalThis.crypto.randomUUID();
 awaiting.set(slot, id);
 try { globalThis.sessionStorage?.setItem(slot, id); } catch { /* retain the in-memory key */ }
 const result = await send(id);
 if (awaiting.get(slot) === id) awaiting.delete(slot);
 try {
  if (globalThis.sessionStorage?.getItem(slot) === id) globalThis.sessionStorage.removeItem(slot);
 } catch { /* the server already holds the authoritative result */ }
 return result;
}
