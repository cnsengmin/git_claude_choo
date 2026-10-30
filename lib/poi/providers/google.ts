import { normalizeCategory } from "../category";
import type { AtlasPoi, PoiSearchResponse } from "../types";

type GooglePlace = {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  primaryTypeDisplayName?: { text?: string };
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  regularOpeningHours?: { openNow?: boolean };
};

type GoogleNearbyResponse = { places?: GooglePlace[] };

export type GoogleNearbyInput = {
  lat: number;
  lng: number;
  radius: number;
  includedTypes?: string[];
  maxResultCount?: number;
};

export async function searchGoogleNearby(input: GoogleNearbyInput): Promise<PoiSearchResponse> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_API_KEY is not configured");

  const response = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": [
        "places.id",
        "places.displayName",
        "places.formattedAddress",
        "places.location",
        "places.primaryType",
        "places.primaryTypeDisplayName",
        "places.rating",
        "places.userRatingCount",
        "places.googleMapsUri",
        "places.nationalPhoneNumber",
        "places.regularOpeningHours.openNow",
      ].join(","),
    },
    body: JSON.stringify({
      includedTypes: input.includedTypes?.length ? input.includedTypes : undefined,
      maxResultCount: Math.min(Math.max(input.maxResultCount ?? 10, 1), 20),
      locationRestriction: {
        circle: {
          center: { latitude: input.lat, longitude: input.lng },
          radius: Math.max(1, input.radius),
        },
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Google Places Nearby Search failed: ${response.status} ${await response.text()}`);
  }

  const data = (await response.json()) as GoogleNearbyResponse;
  const retrievedAt = new Date().toISOString();
  const items: AtlasPoi[] = (data.places ?? []).map((place) => {
    const name = place.displayName?.text ?? "Unnamed place";
    const categoryPath = place.primaryTypeDisplayName?.text ?? place.primaryType ?? "";
    return {
      provider: "google",
      providerId: place.id,
      name,
      category: normalizeCategory(categoryPath, name),
      categoryPath,
      address: place.formattedAddress,
      lat: place.location?.latitude,
      lng: place.location?.longitude,
      phone: place.nationalPhoneNumber,
      url: place.googleMapsUri,
      rating: place.rating,
      reviewCount: place.userRatingCount,
      openNow: place.regularOpeningHours?.openNow,
      retrievedAt,
    };
  });

  return {
    provider: "google",
    count: items.length,
    items,
    retrievedAt,
    warning: "Google Places content must be handled under Google Maps Platform terms. Do not treat this response as an unrestricted permanent POI database.",
  };
}
