# Supabase Multi-Environment Quick Start

## Current Status

✅ You have: `supabase/config.toml` configured with dev branch  
✅ Dev branch ID: `hwitxyvjzttpppesgjmc`  
❌ Missing: CLI link to your dev branch  
❌ Missing: Correct environment variables in `.env.local`

---

## Fix 1: Link CLI to Dev Branch

**Check if you're already linked:**
```bash
# Check if .supabase directory exists
ls -la | grep .supabase

# If it exists, check what you're linked to:
cat .supabase/config.toml | grep project_id
```

**Link to your dev branch:**
```bash
# Use the branch ID from your config.toml
supabase link --project-ref hwitxyvjzttpppesgjmc
```

**If you get an error about needing to login first:**
```bash
supabase login
# Follow the prompts to authenticate
# Then try linking again
```

---

## Fix 2: Update .env.local with Correct Variables

**Problem:** Your `.env.local` is missing the `NEXT_PUBLIC_` prefixes that Next.js needs.

**Add these lines to the top of your `.env.local`:**
```bash
# Next.js public environment variables (required!)
NEXT_PUBLIC_SUPABASE_URL="https://hwitxyvjzttpppesgjmc.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh3aXR4eXZqenR0cHBwZXNnam1jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMzI5NjgsImV4cCI6MjA3NzYwODk2OH0.nsIe_hJ0R16-IiTwqrSTp7glhFQB8Mqa8XF-tqU1Cik"
```

**Why this matters:**
- `SUPABASE_URL` = Server-side only (API routes)
- `NEXT_PUBLIC_SUPABASE_URL` = Exposed to browser (client components)
- Next.js requires the `NEXT_PUBLIC_` prefix for client-side access

---

## Fix 3: Verify Branch Connection

**List all branches:**
```bash
supabase --experimental branches list
```

**Get details about your dev branch:**
```bash
supabase --experimental branches get develop
```

**Expected output should show:**
```
BRANCH PROJECT ID: hwitxyvjzttpppesgjmc
DATABASE URL: postgres://...
API URL: https://hwitxyvjzttpppesgjmc.supabase.co
```

---

## Troubleshooting Commands

### "How do I know which branch I'm connected to?"

**Method 1: Check CLI link**
```bash
cat .supabase/config.toml | grep project_id
```

**Method 2: Use projects list**
```bash
supabase projects list
# Look for the → indicator next to your linked project
```

### "My CLI commands aren't working"

**Make sure you're authenticated:**
```bash
supabase login
```

**Use experimental flag for branch commands:**
```bash
# ✅ Correct
supabase --experimental branches list

# ❌ Wrong
supabase branches list
```

### "How do I get the API keys?"

**Option 1: From Dashboard** (recommended)
1. Go to: https://supabase.com/dashboard/project/hwitxyvjzttpppesgjmc/settings/api
2. Copy values:
   - **Project URL** → Both `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL`
   - **anon key** → Both `SUPABASE_ANON_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`

**Option 2: From CLI**
```bash
supabase --experimental branches get develop --output env
```

### "The database output you showed earlier"

The output you pasted earlier:
```
HOST | PORT | USER | PASSWORD | JWT SECRET | POSTGRES VERSION | STATUS
db.hwitxyvjzttpppesgjmc.supabase.co | 5432 | postgres | ...
```

This is **database connection info**, not API credentials. This comes from a different command (maybe `supabase db inspect`?).

**What you actually need:**
- API URL: `https://hwitxyvjzttpppesgjmc.supabase.co`
- Anon Key: (from dashboard)
- Service Role Key: (from dashboard)

---

## Testing Your Setup

**1. Verify environment variables are loaded:**
```bash
# In your Next.js app
npm run dev

# Check browser console - should see your Supabase URL
console.log(process.env.NEXT_PUBLIC_SUPABASE_URL)
```

**2. Test database connection:**
```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// Try a simple query
const { data, error } = await supabase
  .from('your_table')
  .select('*')
  .limit(1)

console.log('Connection test:', { data, error })
```

**3. Verify you're hitting dev branch:**
- Check your Supabase dashboard: https://supabase.com/dashboard/project/hwitxyvjzttpppesgjmc
- Run a query in your app
- Check "Logs" in dashboard to see if the query appears

---

## Next Steps

Once your CLI is linked and .env.local is fixed:

1. ✅ Your local app will connect to the remote dev branch
2. ✅ You can create migrations with `supabase db diff`
3. ✅ You can push migrations with `supabase db push`
4. ✅ Your team shares the same dev database

**No Docker required!** Your local app (localhost:3000) talks directly to the remote dev branch.

---

## Common Mistakes

❌ Running `supabase start` (don't need Docker)  
❌ Using `supabase branches list` without `--experimental` flag  
❌ Missing `NEXT_PUBLIC_` prefix on environment variables  
❌ Trying to use database credentials instead of API credentials  
❌ Linking to production instead of dev branch

---

## Quick Command Reference

```bash
# Login
supabase login

# Link to dev branch  
supabase link --project-ref hwitxyvjzttpppesgjmc

# Check what you're linked to
cat .supabase/config.toml | grep project_id

# List branches
supabase --experimental branches list

# Get branch details
supabase --experimental branches get develop

# Create migration from changes
supabase db diff -f migration_name

# Apply migrations
supabase db push

# View migration status
supabase migration list
```
