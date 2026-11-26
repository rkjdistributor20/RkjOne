/** Namespaces a stable POS checkout identity without trusting it for access. */
export function getManualQrSaleKey(shiftId: string, cartSessionId: unknown): string | undefined {
 if (typeof cartSessionId !== 'string'
  || !/^(?:cart-\d{10,16}-[a-z0-9]{1,12}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(cartSessionId)) return undefined;
 return `manual-qr:${shiftId}:${cartSessionId.toLowerCase()}`;
}
