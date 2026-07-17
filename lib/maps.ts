import "server-only";

export type LatLng = { lat: number; lng: number };

const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

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

export type AddressSuggestion = {
  placeId: string;
  mainText: string;
  secondaryText: string;
};

export type ResolvedAddress = {
  formatted: string;
  address: string;
  postalCode: string;
  city: string;
  location: LatLng;
};

/**
 * Places API (New) Autocomplete — bruges til den rigtige adresse-søgning
 * med dropdown (afløser det bløde geocoding-baserede tjek, som Google
 * kunne omgå ved at falde tilbage til kun at matche landet, se
 * [[project_address_soft_validation_feature]]). Med Autocomplete + et
 * KRÆVET valg fra listen kan brugeren slet ikke gemme en adresse, Google
 * ikke selv har foreslået.
 *
 * `sessionToken` skal være samme værdi for alle kald i én søgesession
 * (hver tastetryk + det efterfølgende getPlaceDetails-opslag), så Google
 * kan fakturere det som én samlet session i stedet for et opslag pr.
 * tastetryk — se prisliste-kommentar i getPlaceDetails().
 *
 * `includedPrimaryTypes` kan bruges til at bede Google om kun at foreslå
 * grovere resultater (fx by/postnummer-niveau for freelancer-lokation, hvor
 * en fuld gadeadresse ikke er nødvendig) — udelades for virksomheds- og
 * venue-adresser, som skal kunne matche på gadeniveau.
 */
export async function autocompleteAddress(
  input: string,
  sessionToken: string,
  includedPrimaryTypes?: string[]
): Promise<AddressSuggestion[]> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey || !input.trim()) return [];

  try {
    const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
      },
      body: JSON.stringify({
        input,
        sessionToken,
        includedRegionCodes: ["dk"],
        languageCode: "da",
        ...(includedPrimaryTypes ? { includedPrimaryTypes } : {}),
      }),
    });

    if (!res.ok) {
      console.error("autocompleteAddress: HTTP-fejl", res.status, await res.text());
      return [];
    }

    const data = await res.json();
    const suggestions: { placePrediction?: Record<string, unknown> }[] = data.suggestions ?? [];

    return suggestions
      .filter((s) => s.placePrediction)
      .map((s) => {
        const p = s.placePrediction as {
          placeId: string;
          text?: { text?: string };
          structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
        };
        return {
          placeId: p.placeId,
          mainText: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
          secondaryText: p.structuredFormat?.secondaryText?.text ?? "",
        };
      });
  } catch (err) {
    console.error("autocompleteAddress: opslag fejlede", err);
    return [];
  }
}

/**
 * Places API (New) Place Details — slår et konkret forslag (valgt fra
 * autocompleteAddress-listen) op og returnerer strukturerede
 * adresse-komponenter + koordinater. Kaldes ÉN gang pr. søgesession (når
 * brugeren klikker et forslag), hvorefter `sessionToken` skal udskiftes med
 * en ny værdi til næste søgning — det er det, der gør at hele sessionens
 * autocomplete-opslag faktureres som gratis "Autocomplete Session Usage" i
 * stedet for pr.-tastetryk-pris, ifølge Googles prisliste (tjekket
 * 2026-07-18): kun selve dette ene Place Details-opslag koster noget
 * (10.000 gratis/måned, derefter ca. 5 kr. pr. 1000 — ikke-eksisterende
 * beløb ved Pepos forventede volumen).
 */
export async function getPlaceDetails(
  placeId: string,
  sessionToken: string
): Promise<ResolvedAddress | null> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = new URL(`${PLACES_DETAILS_URL}/${placeId}`);
    url.searchParams.set("sessionToken", sessionToken);

    const res = await fetch(url.toString(), {
      headers: {
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "addressComponents,location,formattedAddress",
      },
    });

    if (!res.ok) {
      console.error("getPlaceDetails: HTTP-fejl", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const components: { longText?: string; types?: string[] }[] = data.addressComponents ?? [];
    const get = (type: string) => components.find((c) => c.types?.includes(type))?.longText ?? "";

    const address = [get("route"), get("street_number")].filter(Boolean).join(" ");
    const postalCode = get("postal_code");
    // Danmark bruger typisk "postal_town" eller "locality" afhængigt af hvor
    // specifikt Google har matchet — begge tjekkes, i den prioritetsorden.
    const city = get("postal_town") || get("locality") || get("sublocality") || "";

    const location = data.location as { latitude?: number; longitude?: number } | undefined;
    if (typeof location?.latitude !== "number" || typeof location?.longitude !== "number") return null;

    return {
      formatted: data.formattedAddress ?? [address, postalCode, city].filter(Boolean).join(", "),
      address,
      postalCode,
      city,
      location: { lat: location.latitude, lng: location.longitude },
    };
  } catch (err) {
    console.error("getPlaceDetails: opslag fejlede", err);
    return null;
  }
}
