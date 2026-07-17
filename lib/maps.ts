import "server-only";

export type LatLng = { lat: number; lng: number };

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

/**
 * Slår en adresse op hos Google Geocoding API og returnerer koordinater.
 *
 * Fejler aldrig hårdt for den kaldende handling (fx "gem virksomhedsprofil"
 * eller "gem venue") — geokodning er en ekstra service, der beriger data,
 * ikke en forudsætning for at selve gemmehandlingen lykkes. Returnerer
 * `null` hvis nøglen mangler, adressen er tom, eller opslaget fejler.
 */
export async function geocodeAddress(
  address: string,
  postalCode: string | null,
  city: string | null
): Promise<LatLng | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("geocodeAddress: GOOGLE_MAPS_API_KEY er ikke sat — springer geokodning over");
    return null;
  }

  const fullAddress = [address, postalCode, city, "Danmark"].filter(Boolean).join(", ");
  if (!fullAddress.trim()) return null;

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set("address", fullAddress);
    url.searchParams.set("region", "dk");
    url.searchParams.set("key", apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      console.error("geocodeAddress: HTTP-fejl", res.status);
      return null;
    }

    const data = await res.json();
    if (data.status !== "OK" || !data.results?.[0]) {
      console.error("geocodeAddress: intet resultat for adresse", fullAddress, data.status);
      return null;
    }

    const result = data.results[0];

    // Google falder tilbage til at matche kun landet ("Danmark", som vi
    // altid tilføjer til søgestrengen nedenfor), hvis intet andet i
    // adressen kan genkendes — og returnerer stadig status "OK" for det!
    // Det betyder ren gibberish-tekst ellers altid "lykkedes" med
    // Danmarks geografiske midtpunkt som resultat, hvilket gjorde
    // adresse-tjekket nyttesløst (opdaget 2026-07-18, se
    // [[project_address_soft_validation_feature]]). Et rigtigt postnummer
    // matcher stadig fint (dets address_components indeholder "postal_code"
    // ud over "country") — kun det RENE land-niveau-fallback afvises her.
    const components: { types?: string[] }[] = result.address_components ?? [];
    const hasSpecificComponent = components.some(
      (c) => !(c.types ?? []).every((t) => t === "country" || t === "political")
    );
    if (!hasSpecificComponent) {
      console.error("geocodeAddress: kun land-niveau matchede (for upræcist) for adresse", fullAddress);
      return null;
    }

    const location = result.geometry?.location;
    if (typeof location?.lat !== "number" || typeof location?.lng !== "number") return null;

    return { lat: location.lat, lng: location.lng };
  } catch (err) {
    console.error("geocodeAddress: opslag fejlede", err);
    return null;
  }
}

/**
 * Beregner køreafstand i kilometer mellem to koordinater via Google Routes
 * API (computeRoutes). Bruges til at cache virksomhedens køreafstand til en
 * given venue, så vi ikke slår det op igen ved hvert sidevisning.
 *
 * Fejler aldrig hårdt — returnerer `null` hvis nøglen mangler eller
 * opslaget fejler, så kaldende kode kan lade transporttillægget stå tomt
 * i stedet for at vælte hele gemmehandlingen.
 */
export async function getDrivingDistanceKm(
  origin: LatLng,
  destination: LatLng
): Promise<number | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.warn("getDrivingDistanceKm: GOOGLE_MAPS_API_KEY er ikke sat — springer opslag over");
    return null;
  }

  try {
    const res = await fetch(ROUTES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        units: "METRIC",
      }),
    });

    if (!res.ok) {
      console.error("getDrivingDistanceKm: HTTP-fejl", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const meters = data.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number") return null;

    return Math.round((meters / 1000) * 100) / 100;
  } catch (err) {
    console.error("getDrivingDistanceKm: opslag fejlede", err);
    return null;
  }
}

/**
 * Slår adresse op og beregner køreafstand fra virksomhedens koordinater i
 * ét trin. Bruges når en venue-adresse gemmes/ændres og virksomhedens
 * koordinater allerede kendes.
 */
export async function geocodeAndMeasureFromCompany(
  address: string,
  postalCode: string | null,
  city: string | null,
  companyLocation: LatLng | null
): Promise<{ location: LatLng | null; distanceKm: number | null }> {
  const location = await geocodeAddress(address, postalCode, city);
  if (!location || !companyLocation) {
    return { location, distanceKm: null };
  }

  const distanceKm = await getDrivingDistanceKm(companyLocation, location);
  return { location, distanceKm };
}
