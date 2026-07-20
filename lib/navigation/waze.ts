const WAZE_BASE_URL = 'https://www.waze.com/ul';
const WAZE_SOURCE = 'rkj_one';

export interface WazeDestination {
 latitude?: number | null;
 longitude?: number | null;
 query?: string | null;
 navigate?: boolean;
 avoidTolls?: boolean;
 avoidFerries?: boolean;
 avoidFreeways?: boolean;
 avoidDangerousTurns?: boolean;
 avoidTrails?: 'avoid_all' | 'allow' | 'avoid_long';
}

function validCoordinate(value: number | null | undefined) {
 return typeof value === 'number' && Number.isFinite(value);
}

export function buildWazeUrl({
 latitude,
 longitude,
 query,
 navigate = true,
 avoidTolls,
 avoidFerries,
 avoidFreeways,
 avoidDangerousTurns,
 avoidTrails,
}: WazeDestination) {
 const params = new URLSearchParams();
 const cleanQuery = query?.trim();

 if (validCoordinate(latitude) && validCoordinate(longitude)) {
  params.set('ll', `${latitude},${longitude}`);
 }
 if (cleanQuery) params.set('q', cleanQuery);
 if (navigate) params.set('navigate', 'yes');
 if (avoidTolls !== undefined) params.set('avoid_tolls', String(avoidTolls));
 if (avoidFerries !== undefined) params.set('avoid_ferries', String(avoidFerries));
 if (avoidFreeways !== undefined) params.set('avoid_freeways', String(avoidFreeways));
 if (avoidDangerousTurns !== undefined) params.set('avoid_dangerous_turns', String(avoidDangerousTurns));
 if (avoidTrails) params.set('avoid_trails', avoidTrails);
 params.set('utm_source', WAZE_SOURCE);

 return `${WAZE_BASE_URL}?${params.toString()}`;
}

export function buildWazeLocationUrl(locationName: string) {
 const query = /malaysia/i.test(locationName) ? locationName : `${locationName}, Malaysia`;
 return buildWazeUrl({ query });
}
