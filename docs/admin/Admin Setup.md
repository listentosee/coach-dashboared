# Admin Setup (Secure Notes — Do NOT commit)

This file is intentionally ignored by git (see `.gitignore`). Store it locally and copy into your password manager. It documents the exact steps and values you need to bootstrap a system administrator on this project.

IMPORTANT
- Never commit plaintext secrets. This file is ignored by git; keep it local only.
- Only the SHA‑256 hash of the Admin Creation Key is stored in the environment.

---

Admin Creation Key (PLAINTEXT)
- Choose a long, random passphrase (32+ chars). Store it in your password manager.
- PLAINTEXT KEY: <PUT_PLAINTEXT_HERE>

Compute SHA‑256 Digest (HEX)
Use any one of the following:

1) macOS / Linux (shasum)
  echo -n '<PUT_PLAINTEXT_HERE>' | shasum -a 256 | awk '{print $1}'

2) OpenSSL
  printf '%s' '<PUT_PLAINTEXT_HERE>' | openssl dgst -sha256 | awk '{print $2}'

3) Node.js
  node -e "console.log(require('crypto').createHash('sha256').update(process.argv[1]).digest('hex'))" '<PUT_PLAINTEXT_HERE>'

Record the HEX digest here:
- SHA‑256 HEX: <PUT_SHA256_HEX_HERE>

Set Environment Variable
- Key: ADMIN_CREATION_KEY_HASH
- Value: <PUT_SHA256_HEX_HERE>
- Where: Vercel → Project → Settings → Environment Variables (Production/Preview/Development as needed). Redeploy.

Gate 1: Access URL
- Open this URL in a browser (replace domain + hash):
  https://<your-domain>/admin-setup?hash=<PUT_SHA256_HEX_HERE>
- If the hash matches ADMIN_CREATION_KEY_HASH, the admin creation form will render. Otherwise you’ll see “Access Denied”.

Gate 2: Form Submission
- Fields: Email, Password, Full Name, First, Last, School/Organization
- Admin Creation Key (PLAINTEXT): enter <PUT_PLAINTEXT_HERE> (do NOT paste the SHA‑256 hex).
- On success, an admin auth user is created (email confirmed) and a `profiles` row is inserted with role=admin.
- Then sign in at /auth/login.

Rotation / Cleanup
- After bootstrapping:
  - Rotate the Admin Key: regenerate a new PLAINTEXT + SHA‑256, update ADMIN_CREATION_KEY_HASH, redeploy (invalidates old links).
  - Optionally restrict or remove the /admin-setup route if not needed.

Troubleshooting
- “Admin creation not configured”: ADMIN_CREATION_KEY_HASH not set.
- “Invalid hash”: URL `hash` doesn’t match ADMIN_CREATION_KEY_HASH exactly.
- “Invalid admin key”: Entered PLAINTEXT doesn’t hash to ADMIN_CREATION_KEY_HASH.
- “User already exists”: That email is already present in Supabase; use a different email or delete the user.
- 500 errors: Check SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables.

Internal References
- UI: app/admin-setup/page.tsx
- Gate 1: app/api/admin/verify-access/route.ts
- Gate 2: app/api/admin/create-admin/route.ts

