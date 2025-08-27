let cachedAccessToken: string | null = null;
let cachedExpiry = 0;

export async function getZohoAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && now < cachedExpiry - 60_000) return cachedAccessToken;

  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN!,
    client_id: process.env.ZOHO_CLIENT_ID!,
    client_secret: process.env.ZOHO_CLIENT_SECRET!,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${process.env.ZOHO_ACCOUNTS_URL}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!res.ok) throw new Error(`Zoho OAuth refresh failed: ${res.status} ${await res.text()}`);

  const json = await res.json();
  cachedAccessToken = json.access_token;
  cachedExpiry = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  return cachedAccessToken!;
}
