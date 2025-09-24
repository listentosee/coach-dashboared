## Partner Integration Notes

**Overview**

- SSO entry point: `https://nuggets.cyber-guild.org/auth/partner-sso`
- Required query params: `email`, `name`, `partnerAppId`, `ts` (seconds), `sig`
- Optional query params: `redirect` (relative path or pre-approved origin)
- Signature algorithm: HMAC-SHA256 on canonical string `email|name|partnerAppId|ts|redirect` (empty string if redirect omitted), output encoded with Base64URL (no padding)

### **Implementing the Request**

1. Obtain partner app ID and shared secret from CyberNuggets admin (rotate via SSO Management UI).
	- ID: iemc
	- Secret: Z4HLRyQlvdqnN6cNhXYsEWJ4-CGvpxbNSdHrN6WDvfw
2. Generate payload, normalising email to lowercase, trimming inputs, ensuring `ts` is current unix timestamp (within ±5 minutes).
3. Construct canonical string in the exact order, using `''` when redirect omitted.
4. Compute `sig = base64urlencode(hmac_sha256(canonicalString, secret))`.
5. Redirect user’s browser to `/auth/partner-sso?...` with all values URL-encoded.

### **Application Configuration (Coaches Dashboard)**

- Set `CYBERNUGGETS_PARTNER_APP_ID` and `CYBERNUGGETS_PARTNER_SECRET` in the runtime environment; these are required for `/api/cybernuggets/sso` to mint signed URLs.
	- Current app ID: `iemc`
	- Current shared secret: `Z4HLRyQlvdqnN6cNhXYsEWJ4-CGvpxbNSdHrN6WDvfw`
- Optional overrides:
	- `CYBERNUGGETS_SSO_BASE_URL` (defaults to `https://nuggets.cyber-guild.org`).
	- `CYBERNUGGETS_ALLOWED_REDIRECT_ORIGINS` (comma-delimited list; required before allowing absolute `redirect` values).
- The Coaches Tools sidebar button now calls `/api/cybernuggets/sso` to open CyberNuggets in a new tab via SSO once the env vars are present.

### **TypeScript Example**
```ts

import { createHmac } from 'crypto';

function toBase64Url(buffer: Buffer) {
  return buffer.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function buildPartnerSsoUrl({
  supabaseHost,
  email,
  name,
  partnerAppId,
  redirect,
  secret,
}: {
  supabaseHost: string;
  email: string;
  name: string;
  partnerAppId: string;
  redirect?: string;
  secret: string;
}) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedName = name.trim();
  const redirectValue = redirect ? redirect.trim() : '';
  const ts = Math.floor(Date.now() / 1000);
  const canonical = [normalizedEmail, normalizedName, partnerAppId, ts, redirectValue].join('|');
  const sig = toBase64Url(createHmac('sha256', secret).update(canonical, 'utf8').digest());
  const params = new URLSearchParams({
    email: normalizedEmail,
    name: normalizedName,
    partnerAppId,
    ts: ts.toString(),
    sig,
  });
  if (redirectValue) params.set('redirect', redirectValue);
  return `${supabaseHost}/auth/partner-sso?${params.toString()}`;
}

```

### **Python Example**
```python
import base64
import hashlib
import hmac
import time
from urllib.parse import urlencode

def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip('=')

def build_partner_sso_url(host, email, name, partner_app_id, secret, redirect=None):
    normalized_email = email.strip().lower()
    normalized_name = name.strip()
    redirect_value = redirect.strip() if redirect else ''
    ts = int(time.time())
    canonical = '|'.join([normalized_email, normalized_name, partner_app_id, str(ts), redirect_value])
    sig = base64url(hmac.new(secret.encode(), canonical.encode(), hashlib.sha256).digest())
    params = {
        'email': normalized_email,
        'name': normalized_name,
        'partnerAppId': partner_app_id,
        'ts': str(ts),
        'sig': sig,
    }
    if redirect_value:
        params['redirect'] = redirect_value
    return f"{host}/auth/partner-sso?{urlencode(params)}"
```

### **Rotation & Revocation**
- Admins rotate secrets in the CyberNuggets SSO Management UI; partners must update their stored secret immediately to avoid authentication failures.
- Deleting a partner revokes access instantly; attempted SSO hand-offs respond with `401`.
- Legacy environment variables (`PARTNER_SSO_SHARED_SECRET`, `PARTNER_SSO_ALLOWED_APPS`) remain as fallback while partners transition, but will be phased out once all partners move to per-app keys.

### **Error Handling Tips**
- `400` errors indicate malformed payloads (missing params, invalid signature encoding, invalid redirect).
- `401` errors mean the partner app ID is not recognised or the signature doesn’t match (possibly skewed timestamp or rotated secret).
- Include server-side logs on the partner app to capture the exact URL sent; compare against CyberNuggets `system_log` entries (`partner_sso.*` events) to troubleshoot.
