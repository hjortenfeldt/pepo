/**
 * Ren geo-hjælpefunktion uden afhængigheder — bruges både af
 * transporttillæg-relaterede beregninger og (nyere) af geofence-tjekket i
 * freelancer-appens stempelur (se OverviewClient.tsx). Ligger her i stedet
 * for i lib/maps.ts, fordi denne funktion ikke kalder Google-API'er — den
 * regner blot lige-linje-afstand mellem to koordinatsæt.
 */
export function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000; // jordens radius i meter
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return R * c;
}
