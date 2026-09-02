export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_008.8;

const toRadians = (value: number) => (value * Math.PI) / 180;

export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b.lng - a.lng);

  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function circleSamplePoints(center: GeoPoint, radiusM: number): GeoPoint[] {
  const safeRadius = Math.max(50, Math.min(radiusM, 20_000));
  const sampleRadius = safeRadius * 0.85;
  const latDelta = sampleRadius / 111_320;
  const lngScale = Math.max(0.2, Math.cos(toRadians(center.lat)));
  const lngDelta = sampleRadius / (111_320 * lngScale);

  return [
    center,
    { lat: center.lat + latDelta, lng: center.lng },
    { lat: center.lat - latDelta, lng: center.lng },
    { lat: center.lat, lng: center.lng + lngDelta },
    { lat: center.lat, lng: center.lng - lngDelta },
  ];
}
