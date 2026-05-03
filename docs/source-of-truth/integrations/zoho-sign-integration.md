
# Zoho Sign Integration — Minor vs Adult Templates (Next.js 14 + Supabase)

**Goal**: Use **two Zoho Sign templates** (Adult and Minor) that contain your attached release forms. At send time, your code picks the correct template by age:

- **Under 18 → Minor template** (sent to **Parent/Guardian** email only)  
- **18 or over → Adult template** (sent to **Participant** email only)

You’ll still get: prefill from your DB, **email or in‑person** signing, **print & physically sign** fallback, webhook‑driven updates to your dashboard, and automatic PDF storage.

> Why two templates? In Zoho Sign, a template’s **documents and recipient actions are fixed**. The API lets you prefill and set recipient details, but not *conditionally include/exclude* individual files from a multi‑file template at send time. So the clean approach is one template per scenario (Adult vs Minor).

---

## 1) What you’ll set up

- **Two Zoho Sign templates** (use your provided PDFs when creating them):
  - **Template A (Adult)**: “IE Mayors Cup 2025 **Adult** Release” — *one signer role*: `Participant`.
  - **Template B (Minor)**: “IE Mayors Cup 2025 **Minor** Release” — *one signer role*: `ParentGuardian`.

- **/api/zoho/send** — Server route that selects the correct template by `competitor.is_18_or_over`, pre-fills fields, and sends for signature (email or **in‑person**).
- **/api/zoho/webhook** — Verifies HMAC, updates `agreements` table and competitor status, downloads the signed PDF to Supabase Storage.
- **Supabase** schema & bucket: `agreements` table + private `signatures` bucket.

---

## 2) Prepare the templates in Zoho Sign (one‑time)

1) **Create Template A (Adult)**  
   - Upload **“IE Mayors Cup Release Form 2025 Adult”** PDF.  
   - Add a single signer role named **`Participant`** (action: **SIGN**).  
   - Add fields the signer must fill/sign (name, signature, date).  
   - Add **prefill** fields you want to merge from your app (examples below).

2) **Create Template B (Minor)**  
   - Upload **“IE Mayors Cup Release Form 2025 Minor”** PDF.  
   - Add a single signer role named **`ParentGuardian`** (action: **SIGN**).  
   - Add signer fields (name, signature, date).  
   - Add **prefill** fields (same names as Adult where applicable).

**Suggested prefill field labels** (align these exactly in both templates):
- `participant_name` (Text)
- `school` (Text)
- `grade` (Text)
- `address` (Text) — optional if you don’t store it
- `program_dates` (Text) — e.g., “September 15, 2025 – May 30, 2026”
- (Any additional values you want locked/read‑only for signers)

> You can add fields directly in Zoho Sign or by placing **text tags** inside the PDFs before upload. Keep labels identical across Adult/Minor to reuse the same code path.

Record each template’s **Template ID**.

---

## 3) Environment variables (Vercel → Project → Settings → Environment)

```bash
# Zoho OAuth
ZOHO_ACCOUNTS_URL=https://accounts.zoho.com        # use your region (.eu, .in) if needed
ZOHO_SIGN_BASE_URL=https://sign.zoho.com           # use regional base if applicable
ZOHO_CLIENT_ID=...
ZOHO_CLIENT_SECRET=...
ZOHO_REFRESH_TOKEN=...

# Templates (adult vs minor)
ZOHO_SIGN_TEMPLATE_ID_ADULT=...
ZOHO_SIGN_TEMPLATE_ID_MINOR=...

# Webhook
ZOHO_WEBHOOK_SECRET=...        # same secret configured in Zoho Sign webhook

# App & Supabase
APP_URL=https://your-app.vercel.app
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 4) Supabase schema & storage

```sql
create table if not exists agreements (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references competitors(id) on delete cascade,
  provider text not null default 'zoho',
  template_kind text not null check (template_kind in ('adult','minor')),
  request_id text not null,
  status text not null default 'sent',   -- sent | viewed | completed | declined | expired
  signers jsonb,                         -- [{role,email,name,status}]
  signed_pdf_path text,
  metadata jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists agreements_idx1 on agreements (competitor_id);
create index if not exists agreements_idx2 on agreements (provider, request_id);
```

Create a **private** bucket named **`signatures`** for PDFs.

---

## 5) Next.js server code (App Router)

### 5.1 OAuth helper — exchange refresh token

`app/api/zoho/_lib/token.ts`
```ts
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
```

### 5.2 Send route — choose template by age, prefill, and send

`app/api/zoho/send/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getZohoAccessToken } from '../_lib/token';

type Body = {
  competitorId: string;
  mode?: 'email' | 'inperson';          // 'inperson' for kiosk check-in
};

export async function POST(req: NextRequest) {
  const { competitorId, mode = 'email' } = (await req.json()) as Body;
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  // Pull competitor data (adjust field names if needed)
  const { data: c, error } = await supabase
    .from('competitors')
    .select('id, first_name, last_name, grade, school, email_school, is_18_or_over, parent_name, parent_email')
    .eq('id', competitorId)
    .single();

  if (error || !c) return NextResponse.json({ error: 'Competitor not found' }, { status: 404 });

  const isAdult = !!c.is_18_or_over;
  const templateId = isAdult ? process.env.ZOHO_SIGN_TEMPLATE_ID_ADULT! : process.env.ZOHO_SIGN_TEMPLATE_ID_MINOR!;
  const templateKind = isAdult ? 'adult' : 'minor';

  const accessToken = await getZohoAccessToken();

  // Get template details to read its single action_id
  const tRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
  });
  if (!tRes.ok) {
    return NextResponse.json({ error: 'Failed to load template', detail: await tRes.text() }, { status: 502 });
  }
  const tJson = await tRes.json();
  const action = tJson.templates?.actions?.[0];
  if (!action) {
    return NextResponse.json({ error: 'Template has no signer action' }, { status: 400 });
  }

  // Build the single recipient action
  const recipient =
    isAdult
      ? { name: `${c.first_name} ${c.last_name}`, email: c.email_school } // or use your preferred participant email field
      : { name: c.parent_name, email: c.parent_email };

  if (!recipient.email) {
    return NextResponse.json({ error: 'Missing recipient email for this template' }, { status: 400 });
  }

  const actionPayload: any = {
    action_id: action.action_id,
    action_type: mode === 'inperson' ? 'INPERSONSIGN' : 'SIGN',
    recipient_name: mode === 'inperson' ? recipient.name : recipient.name,
    recipient_email: mode === 'inperson' ? (recipient.email || 'no-email@example.com') : recipient.email,
    verify_recipient: true,
    verification_type: 'EMAIL',
  };
  if (mode === 'inperson') {
    // Host an in-person session for the first signer
    actionPayload.in_person_name = recipient.name;
    actionPayload.in_person_email = recipient.email || 'no-email@example.com';
    actionPayload.is_host = true;
  }

  // Prefill fields (labels must match your template fields)
  const field_data = {
    field_text_data: {
      participant_name: `${c.first_name} ${c.last_name}`,
      school: c.school || '',
      grade: c.grade || '',
      program_dates: 'September 15, 2025 – May 30, 2026', // or process.env.PROGRAM_DATES
    },
    // Add address or other fields if present in your DB and template
  };

  const dataParam = {
    templates: {
      field_data,
      actions: [actionPayload],
      notes: 'Please review and sign the Mayors Cup release.',
    },
  };

  const formBody = new URLSearchParams({
    data: JSON.stringify(dataParam),
    is_quicksend: 'true',
  });

  const createRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/templates/${templateId}/createdocument`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: formBody.toString(),
  });

  const createJson = await createRes.json().catch(() => ({}));
  if (!createRes.ok || createJson.status !== 'success') {
    return NextResponse.json({ error: 'Zoho Sign create failed', detail: createJson }, { status: 502 });
  }

  const requestId = createJson.requests?.request_id as string;

  await supabase.from('agreements').insert({
    competitor_id: c.id,
    provider: 'zoho',
    template_kind: templateKind,
    request_id: requestId,
    status: 'sent',
    signers: [{ role: isAdult ? 'Participant' : 'ParentGuardian', email: recipient.email, name: recipient.name, status: 'sent' }],
    metadata: { templateId, mode },
  });

  return NextResponse.json({ ok: true, requestId, templateKind });
}
```

### 5.3 Webhook — verify HMAC, update status, store signed PDF, stamp competitor

`app/api/zoho/webhook/route.ts`
```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { getZohoAccessToken } from '../_lib/token';

function verifyZohoHmac(rawBody: string, headerSig: string | null) {
  if (!headerSig) return false;
  const calc = crypto.createHmac('sha256', process.env.ZOHO_WEBHOOK_SECRET!).update(rawBody).digest('base64');
  return crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(calc));
}

export async function POST(req: NextRequest) {
  const raw = await req.text(); // compute HMAC over raw body
  const headerSig = req.headers.get('x-zs-webhook-signature');
  if (!verifyZohoHmac(raw, headerSig)) return new NextResponse('invalid signature', { status: 401 });

  const payload = JSON.parse(raw);
  const requestId: string | undefined = payload?.requests?.request_id;
  const requestStatus: string | undefined = payload?.requests?.request_status;

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  if (requestId) {
    const normalized =
      (requestStatus || '').toLowerCase() === 'completed' ? 'completed' :
      (requestStatus || '').toLowerCase() === 'declined' ? 'declined' :
      (requestStatus || '').toLowerCase() === 'expired' ? 'expired' : 'sent';

    const { data: agreement } = await supabase
      .from('agreements')
      .update({ status: normalized, updated_at: new Date().toISOString() })
      .eq('request_id', requestId)
      .select('competitor_id, template_kind')
      .single();

    if (normalized === 'completed' && agreement) {
      try {
        const accessToken = await getZohoAccessToken();
        const pdfRes = await fetch(`${process.env.ZOHO_SIGN_BASE_URL}/api/v1/requests/${requestId}/pdf`, {
          headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
        });
        const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
        const pdfPath = `signed/${requestId}.pdf`;

        await supabase.storage.from('signatures').upload(pdfPath, pdfBuf, {
          contentType: 'application/pdf',
          upsert: true,
        });

        // Stamp competitor row: adult -> participation_agreement_date; minor -> media_release_date
        const dateField = agreement.template_kind === 'adult' ? 'participation_agreement_date' : 'media_release_date';
        await supabase.from('competitors')
          .update({ [dateField]: new Date().toISOString() })
          .eq('id', agreement.competitor_id);

        await supabase.from('agreements')
          .update({ signed_pdf_path: pdfPath })
          .eq('request_id', requestId);
      } catch (e) {
        console.error('PDF store failed', e);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
```

---

## 6) Parent email validation

Minor agreements are sent to the parent/guardian email. Bounced emails are not reported back by Zoho, so a multi-layer validation system prevents sending to bad addresses.

### Layer 1 — Real-time validation at profile save (primary)

When a student saves their profile via `/api/competitors/profile/[token]/update` and the `parent_email` has changed, the route calls `checkEmailDeliverability()` from `lib/validation/email-deliverability.ts`. This utility calls the **Abstract API** email verification endpoint to check:

- MX record exists (domain can receive email)
- SMTP mailbox is valid
- Overall deliverability status

If the email is undeliverable, the route returns a `422` with a field-specific error that the profile form displays inline under the parent email field. The student must correct the email before the profile can be saved.

On successful validation, the competitor record is updated with `parent_email_is_valid = true` and `parent_email_validated_at`.

**Graceful degradation**: If `ABSTRACT_EMAIL_API_KEY` is not configured, the API is down, or the request times out (8s), validation is skipped and the save proceeds normally. The probe job (Layer 2) serves as a fallback.

**Environment variable**: `ABSTRACT_EMAIL_API_KEY` (set in `.env.local` and Vercel env vars, not committed).

### Layer 2 — SendGrid probe email (fallback)

A recurring job (`release_parent_email_verification`, runs hourly via job queue) sends a lightweight probe email to parent addresses for minor agreements that have been in `sent` status for 4+ hours without activity. If the email bounces, SendGrid fires a webhook to `/api/sendgrid/events` which marks `parent_email_is_valid = false` on the competitor record.

### Layer 3 — Pre-send block (safety net)

The `/api/zoho/send` route checks `parent_email_is_valid` before sending a minor agreement. If `false`, the send is blocked with a 400 error telling the coach to have the student fix the email.

### Releases page UI

The releases page shows a single red **"Parent Email Invalid"** badge when `parent_email_is_valid === false`, with a tooltip: _"Parent email is invalid. Have the student fix it in their profile, then cancel and resend the agreement."_

### Key files

| File | Role |
|---|---|
| `lib/validation/email-deliverability.ts` | Abstract API wrapper (shared utility) |
| `app/api/competitors/profile/[token]/update/route.ts` | Validates at profile save time |
| `app/update-profile/[token]/page.tsx` | Displays inline error on 422 |
| `app/api/zoho/send/route.ts` | Pre-send block for known-bad emails |
| `lib/jobs/handlers/releaseParentEmailVerification.ts` | Probe job (4h delay, hourly cron) |
| `app/api/sendgrid/events/route.ts` | Catches bounced probes via webhook |
| `app/dashboard/releases/page.tsx` | Shows "Parent Email Invalid" badge |

---

## 7) In‑person & print‑and‑sign fallback

- **Kiosk/in‑person**: pass `mode: 'inperson'` to `/api/zoho/send` — the first signer is marked `INPERSONSIGN` and can sign on a tablet/phone at check‑in.
- **Print & physically sign**: Signers can choose **More actions → Print and physically sign**; the same request completes after the upload, and your webhook still fires. No manual syncing needed.
- **Cancel & reset**: If a coach needs to abandon the digital flow (wrong email, family requests paper, etc.), they can click **Cancel & Reset** on the Releases dashboard. This sends `POST /api/zoho/cancel` which recalls and deletes the Zoho request, removes the active agreement row, and records an `agreement_voided` entry in `activity_logs`. Once the button finishes, the coach can immediately choose **Print Pre-filled** or upload a signed scan.

> Reporting: filter `activity_logs` where `action = 'agreement_voided'` to see every cancellation, including the competitor, prior status, Zoho cleanup result, and who initiated it.

---

## 8) Coach dashboard wiring

- Add **Send Release** on each competitor row → POST `/api/zoho/send` with `{ competitorId, mode }`.
- Show a **status badge** using the `agreements` row (subscribe via Supabase Realtime).
- Once `signed_pdf_path` is set, show **View PDF** (download from Storage).
- Your existing status logic can remain: minors update `media_release_date`; adults update `participation_agreement_date` — which the webhook sets automatically.

---

## 9) Testing matrix

- **Adult flow**: participant email; email signing and in‑person variants.
- **Minor flow**: parent email; email signing and in‑person variants.
- **Print & physically sign**: for each flow, verify completion/webhook and PDF storage.
- **Failures**: decline/expire paths update status correctly.
- **Security**: webhook rejects tampered payloads (bad HMAC).

---

## 10) Notes & options

- If you later need a **second guardian**, make a separate **Minor (2‑signer)** template and switch which Minor template ID you use at runtime.
- To reduce paper, combine **pre‑send email/SMS** + **kiosk** at check‑in.
- For bulk sends, create a simple admin action that iterates competitors and calls `/api/zoho/send`.

---

### Field mapping cheatsheet (align labels in both templates)

| Template | Signer role | Email used | Required fields (examples) |
|---|---|---|---|
| Adult | `Participant` | `competitor.email_school` (or preferred field) | participant_name, school, grade, program_dates |
| Minor | `ParentGuardian` | `competitor.parent_email` | participant_name, school, grade, program_dates |

> If your PDFs already include typed “Dates of Program,” you can omit `program_dates` prefill. Otherwise keep it as a static prefill string or env var.

---

## 11) Cleanup — status description helper

In `lib/utils/competitor-status.ts`, align `getStatusDescription()` with your computed statuses (`pending | profile | in_the_game_not_compliant | complete`, with legacy `compliance` treated as `profile`) so UI badges read correctly.
