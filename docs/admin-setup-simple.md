# Simple System Administrator Setup

## Overview

This is a simple system for creating system administrators that requires a special key to complete the process. The key is verified using SHA256 hashing for security.

## Setup

### 1. Generate Admin Key Hash

First, choose your admin creation key (keep this secret), then generate its hash:

```bash
node scripts/generate-admin-hash.js "your-secret-admin-key"
```

### 2. Set Environment Variable

Add the generated hash to your `.env` file:
```bash
ADMIN_CREATION_KEY_HASH=generated_hash_here
```

**Important:** Never store the actual admin key in environment variables, only the hash.

scripts### 3. Fix RLS Policies

Run this SQL in your Supabase dashboard:
```sql
-- Execute: scripts/fix_admin_rls_policies.sql
```

### 4. Create System Administrator

Use the CLI script (server-side only):

```bash
node scripts/create-admin-cli.js
```

The script will:
- Prompt for your admin creation key
- Verify it against the stored hash
- Collect admin details interactively
- Create the admin user in Supabase Auth
- Create the profile record
- Confirm success

## What Gets Created

- **Supabase Auth User** with `role: 'admin'` in metadata
- **Profile Record** with `role = 'admin'` and auto-approval
- **Email confirmed** automatically

## Usage

1. Run the CLI script to create an admin
2. Sign in with the new admin credentials
3. The "Admin Tools" link should now appear in the sidebar

## Security

- Only those with the correct admin key can create admins
- The key is hashed using SHA256 for verification
- The original key is never stored in environment variables
- **No web interface** - CLI only, server-side operation
- Requires access to the server environment variables
