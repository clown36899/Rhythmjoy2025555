export interface VenueLinkSource {
  name?: string | null;
  address?: string | null;
  website_url?: string | null;
  additional_link?: string | null;
  address_link?: string | null;
  map_url?: string | null;
}

const normalizeExternalUrl = (value?: string | null): string => {
  const trimmed = value?.trim();
  if (!trimmed) return "";

  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(javascript|data|file):/i.test(trimmed)) return "";
  return `https://${trimmed}`;
};

const getMapUrl = (mapUrl?: string | null): string => {
  const trimmed = mapUrl?.trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as Record<string, unknown>;
      for (const provider of ["kakao", "naver", "google"]) {
        const candidate = parsed[provider];
        if (typeof candidate === "string") {
          const normalized = normalizeExternalUrl(candidate);
          if (normalized) return normalized;
        }
      }
    } catch {
      return "";
    }
  }

  return normalizeExternalUrl(trimmed);
};

export const hasVenueWebsite = (venue: VenueLinkSource): boolean => (
  Boolean(normalizeExternalUrl(venue.website_url || venue.additional_link))
);

export const getVenueDirectUrl = (venue: VenueLinkSource): string => {
  const websiteUrl = normalizeExternalUrl(venue.website_url || venue.additional_link);
  if (websiteUrl) return websiteUrl;

  const legacyAddressUrl = normalizeExternalUrl(venue.address_link);
  if (legacyAddressUrl) return legacyAddressUrl;

  const mapUrl = getMapUrl(venue.map_url);
  if (mapUrl) return mapUrl;

  const searchTarget = venue.address?.trim() || venue.name?.trim();
  return searchTarget
    ? `https://map.kakao.com/link/search/${encodeURIComponent(searchTarget)}`
    : "";
};
