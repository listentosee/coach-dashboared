export type SchoolGeoPayload = {
  lat: number | null;
  lon: number | null;
  street_address: string | null;
  city: string | null;
  state: string | null;
  county: string | null;
  zip: string | null;
};

function normalizeText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function emptySchoolGeo(): SchoolGeoPayload {
  return {
    lat: null,
    lon: null,
    street_address: null,
    city: null,
    state: null,
    county: null,
    zip: null,
  };
}

export function normalizeSchoolGeo(input: unknown): SchoolGeoPayload {
  const value = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;

  return {
    lat: normalizeNumber(value.lat),
    lon: normalizeNumber(value.lon),
    street_address: normalizeText(value.street_address),
    city: normalizeText(value.city),
    state: normalizeText(value.state),
    county: normalizeText(value.county),
    zip: normalizeText(value.zip),
  };
}
