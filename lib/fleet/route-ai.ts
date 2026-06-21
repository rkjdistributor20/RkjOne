/**
 * Heuristik susunan laluan penghantaran (AI) — keutamaan stok + jarak GPS + arah jalan.
 */

export type RouteStopMeta = {
  key: string;
  locationId: string;
  branchId?: string | null;
  branchCode?: string | null;
  branchName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priority?: number;
  sortKey?: number;
};

export type OptimizeRouteResult = {
  orderedKeys: string[];
  summary: string;
  criticalCount: number;
  lowCount: number;
  usedGps: boolean;
};

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Cermin DB `route_stop_sort_key` untuk pratonton tanpa RPC */
export function routeSortKeyFromBranch(branchName?: string | null, branchCode?: string | null): number {
  let direction = 2;
  const name = branchName ?? '';
  if (/Arah Utara/i.test(name)) direction = 1;
  else if (/Arah Selatan/i.test(name)) direction = 3;
  else if (/Arah Barat/i.test(name)) direction = 2;
  const num = parseInt((branchCode ?? '').replace(/\D/g, ''), 10);
  return direction * 1000 + (Number.isFinite(num) ? num : 0);
}

function distanceScore(
  stop: RouteStopMeta,
  curLat: number | null,
  curLng: number | null
): number {
  if (
    curLat != null &&
    curLng != null &&
    stop.latitude != null &&
    stop.longitude != null
  ) {
    return haversineKm(curLat, curLng, stop.latitude, stop.longitude);
  }
  return stop.sortKey ?? routeSortKeyFromBranch(stop.branchName, stop.branchCode);
}

/**
 * Susun hentian: keutamaan stok (kritikal dulu), kemudian greedy nearest dari lokasi semasa.
 */
export function optimizeRouteStops(
  stops: RouteStopMeta[],
  options?: { currentLat?: number | null; currentLng?: number | null }
): OptimizeRouteResult {
  if (!stops.length) {
    return {
      orderedKeys: [],
      summary: 'Tiada hentian',
      criticalCount: 0,
      lowCount: 0,
      usedGps: false,
    };
  }

  const remaining = [...stops];
  const ordered: RouteStopMeta[] = [];
  let curLat = options?.currentLat ?? null;
  let curLng = options?.currentLng ?? null;
  const usedGps =
    curLat != null &&
    curLng != null &&
    stops.some((s) => s.latitude != null && s.longitude != null);

  while (remaining.length) {
    remaining.sort((a, b) => {
      const pa = a.priority ?? 0;
      const pb = b.priority ?? 0;
      if (pb !== pa) return pb - pa;
      return (
        distanceScore(a, curLat, curLng) - distanceScore(b, curLat, curLng)
      );
    });

    const next = remaining.shift()!;
    ordered.push(next);

    if (next.latitude != null && next.longitude != null) {
      curLat = next.latitude;
      curLng = next.longitude;
    }
  }

  const criticalCount = ordered.filter((s) => (s.priority ?? 0) >= 100).length;
  const lowCount = ordered.filter(
    (s) => (s.priority ?? 0) >= 50 && (s.priority ?? 0) < 100
  ).length;

  const summary = `AI: ${ordered.length} hentian — ${criticalCount} kritikal, ${lowCount} rendah. ${
    usedGps
      ? 'Susunan dari lokasi semasa (GPS).'
      : 'Susunan ikut keutamaan stok & arah jalan Utara→Barat→Selatan.'
  }`;

  return {
    orderedKeys: ordered.map((s) => s.key),
    summary,
    criticalCount,
    lowCount,
    usedGps,
  };
}

export function reorderByKeys<T extends { key: string }>(
  items: T[],
  orderedKeys: string[]
): T[] {
  const map = new Map(items.map((i) => [i.key, i]));
  const result: T[] = [];
  for (const key of orderedKeys) {
    const item = map.get(key);
    if (item) result.push(item);
  }
  for (const item of items) {
    if (!orderedKeys.includes(item.key)) result.push(item);
  }
  return result;
}

export async function readCurrentPosition(): Promise<{
  lat: number;
  lng: number;
} | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  });
}
