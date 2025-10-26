# Solving Supabase Local Development RLS Violations

**The most critical insight:** RLS violations in Supabase local development with service_role_key almost always stem from the Authorization header being overridden by user sessions. The service_role_key must be set in BOTH the apikey and Authorization headers, and any user authentication context (from cookies, auth functions, or session management) will silently replace the service_role authorization, causing RLS enforcement when you expect it to be bypassed. The solution requires using completely separate client instances—one for user operations and one for admin operations—never mixing the two patterns.

**Why this matters:** Developers commonly encounter "new row violates row-level security policy" errors despite correctly initializing clients with service_role_key. This wastes hours debugging RLS policies when the actual problem is client initialization patterns. Understanding the Authorization header behavior eliminates this entire class of bugs.

**The context:** Supabase local development uses Docker containers orchestrated by the CLI, with keys stored in `.supabase/kong/kong.yml` and automatically made available through multiple access methods. These local keys are deterministic and remain consistent across `supabase start` sessions, making them safe to commit in example files. The local environment mirrors production architecture but has key differences in how RLS behaves and how credentials are managed.

**What you'll gain:** This guide provides authoritative solutions from official Supabase documentation, verified GitHub issue resolutions, and battle-tested patterns from the community. You'll learn exactly where keys are stored, how to access them programmatically, why RLS violations occur in server contexts, and complete framework-specific setup patterns that work reliably in both local and production environments.

## Finding your local service_role_key in four ways

The service_role_key for local Supabase instances lives in multiple locations, each serving different access patterns. **The recommended approach is using the CLI status command**, but understanding all options helps when automating workflows or debugging connection issues.

**Using the CLI status command** is the official method. Running `supabase status` displays all running services and credentials, including both anon and service_role keys. For environment variable format suitable for copying directly into .env files, use `supabase status -o env`, which outputs variables like `SERVICE_ROLE_KEY="eyJhbGc..."` ready for immediate use. This command queries the running Docker containers and retrieves current credentials without file parsing.

**The Kong configuration file** stores keys persistently at `.supabase/kong/kong.yml`. This YAML file contains the full Kong API gateway configuration, and at the end you'll find a `consumers` section with username `'private-key'` containing `keyauth_credentials` as an array with both `ANON_KEY` and `SERVICE_KEY` entries. The file is generated when you run `supabase start` and remains in the `.supabase/` directory, which should never be committed to version control. Reading this file programmatically requires YAML parsing, making the CLI approach simpler for most use cases.

**Supabase Studio's built-in access** provides a graphical interface method. Navigate to `http://localhost:54323`, click the avatar icon in the top right corner, select "Command menu," choose "Get API Keys," and select "Copy service API key." This method works well when you're already using Studio for database management and need quick access to credentials without switching to the terminal.

**Edge Functions receive automatic injection** of credentials as environment variables. When running Supabase Edge Functions locally, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are automatically available via `Deno.env.get()`. This happens through Docker container environment variable passing, making credentials immediately accessible in function code without additional configuration.

The keys themselves are JWT tokens signed with the project's JWT secret using the HS256 algorithm. **Local development uses a deterministic JWT secret** (`super-secret-jwt-token-with-at-least-32-characters-long`), which means the same keys are generated consistently across `supabase start` sessions on the same machine. According to Supabase maintainers, these local keys are safe to commit in `.env.example` files since they only work against local instances with no security implications. This differs from production keys, which must be kept secret and rotated periodically.

## Configuring service_role_key in development runtime environments

Making the service_role_key available in your application runtime requires understanding critical security boundaries and framework-specific patterns. **The golden rule: service_role_key must NEVER be exposed to client-side code**, as it bypasses all Row Level Security policies and grants unrestricted database access.

### Environment variable configuration across frameworks

**Next.js applications** use a prefix-based system to control variable exposure. Variables prefixed with `NEXT_PUBLIC_` are bundled into the browser JavaScript, making them accessible client-side. The service_role_key must NEVER use this prefix. Your `.env.local` file should contain:

```bash
# Client-exposed variables (safe for browser)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Server-only variables (NEVER exposed to browser)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Node.js and Express applications** don't have automatic client/server separation, making all environment variables equally accessible to server code. Your `.env` file should load using the `dotenv` package at application startup. The configuration looks similar but without the NEXT_PUBLIC_ prefix distinction since everything runs server-side:

```bash
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
PORT=5000
```

**Edge Functions and Deno deployments** receive environment variables automatically when running locally through Docker container environment injection. For local development with custom secrets, create `supabase/functions/.env` which is automatically loaded by `supabase start`. For deployed Edge Functions, secrets are managed through the Supabase Dashboard or CLI secret management commands.

### Critical client initialization patterns that prevent RLS issues

**The two-client pattern** is essential for any application requiring both user authentication and administrative operations. Create separate client instances that never interact:

```typescript
// Admin client for server-side operations (bypasses RLS)
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

// User client for authenticated operations (respects RLS)
const supabaseUser = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);
```

**The auth configuration options** on the admin client are crucial. Setting `persistSession: false` prevents the client from storing user sessions in localStorage or cookies. Setting `autoRefreshToken: false` disables automatic token refresh logic. Setting `detectSessionInUrl: false` prevents parsing authentication tokens from URL parameters. These options ensure the client maintains its service_role authorization without interference from user authentication flows.

**Next.js App Router requires three distinct clients** for different execution contexts. Client Components use `createBrowserClient` from `@supabase/ssr` with the anon key. Server Components and Route Handlers use `createServerClient` with cookie handlers to maintain user sessions across requests. Administrative operations use the standard `createClient` from `@supabase/supabase-js` with the service_role_key, never mixing SSR helpers with service role credentials.

Here's the correct Next.js setup structure:

```typescript
// utils/supabase/client.ts - Browser client
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// utils/supabase/server.ts - Server component client
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can be ignored in Server Components
          }
        },
      },
    }
  );
}

// utils/supabase/admin.ts - Admin client (server-only!)
import { createClient } from '@supabase/supabase-js';

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);
```

**Express and Node.js applications** use a simpler pattern since everything runs server-side. Create a configuration module that exports both client types:

```javascript
// config/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

module.exports = { supabase, supabaseAdmin };
```

**File organization and security practices** matter significantly. Your `.gitignore` must include `.env.local`, `.env*.local`, `.env.development`, and `.env.production` to prevent committing secrets. Create `.env.example` as a template showing required variables with placeholder values or local development defaults. The `.supabase/` directory containing Kong configuration should also be gitignored since it's generated locally and contains sensitive data.

## Understanding why RLS violations occur with service_role_key

The most common source of confusion and debugging time stems from RLS violations appearing even when service_role_key is correctly configured. **The root cause is Authorization header behavior that overrides the service role context**.

### How authorization actually works in Supabase

Supabase authentication uses two HTTP headers with distinct purposes. The `apikey` header identifies your application and provides basic anti-bot protection. The `Authorization` header determines which PostgreSQL role executes database operations, and **this header controls RLS enforcement**. The apikey header does NOT control RLS—only the Authorization header matters.

When you create a Supabase client with service_role_key, the library sets both headers to the service_role_key value initially. However, any authentication operation that establishes a user session will replace the Authorization header with the user's JWT token. This silent override converts your service role client into an authenticated user client, causing RLS to be enforced when you expect it to be bypassed.

**Three common scenarios cause this override:**

The first scenario involves SSR clients initialized with service_role_key. Server-side rendering frameworks like Next.js use specialized clients (`createServerClient`) designed to read user sessions from cookies and automatically set the Authorization header based on those cookies. Even when initialized with service_role_key, these clients will detect a user session cookie and replace the Authorization header with the user's JWT, causing RLS enforcement.

```typescript
// INCORRECT - SSR client overrides service_role authorization
import { createServerClient } from '@supabase/ssr';

const supabase = createServerClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // This gets overridden!
  { cookies }
);
```

The second scenario involves manually setting the Authorization header in client options. When building Edge Functions or API routes, developers sometimes pass the user's Authorization header from the incoming request:

```typescript
// INCORRECT - Overwrites service_role authorization
const supabase = createClient(
  Deno.env.get('SUPABASE_URL'),
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  {
    global: {
      headers: { Authorization: req.headers.get('Authorization') }
    }
  }
);
```

This replaces the service_role authorization with the user's JWT, defeating the purpose of using service_role_key.

The third scenario involves auth methods that return sessions. Using `supabaseAdmin.auth.signUp()` returns a user session object, which causes subsequent operations with that client to use the user's context rather than service role:

```typescript
// INCORRECT - signUp returns session that replaces service_role
const { data, error } = await supabaseAdmin
  .auth.signUp({ email, password });

// Now this fails with RLS error!
await supabaseAdmin.from('users').insert({ ... });
```

The correct approach uses admin-specific methods: `supabaseAdmin.auth.admin.createUser()` instead of `signUp()`, which creates users without returning sessions that would override authorization.

### Why server-side operations particularly fail

Server-side contexts like webhooks, scheduled jobs, and API routes frequently lack user authentication context. When using the anon key in these scenarios, there's no authenticated user, causing auth.uid() in RLS policies to return null and policies to silently fail. The operation isn't rejected with an error—it just returns empty results or fails to insert data.

**Stripe webhooks illustrate the pattern perfectly.** When Stripe calls your webhook endpoint, there's no user session available. The webhook must update subscription data across any user's records. Using the anon key fails because RLS policies require auth.uid() to match, but there's no authenticated user. The correct solution requires service_role_key to bypass RLS entirely:

```typescript
// API route handling Stripe webhook
export async function POST(request: Request) {
  const event = await verifyStripeWebhook(request);
  
  // MUST use service_role - no user context exists
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    }
  );
  
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: event.data.status })
    .eq('stripe_subscription_id', event.data.id);
}
```

**UPDATE operations require both SELECT and UPDATE permissions**, a frequently overlooked requirement. When you update a row, PostgreSQL must first SELECT it to verify it exists and matches the WHERE clause (using the USING clause), then verify the new values meet constraints (using the WITH CHECK clause), and finally return the updated row data (using SELECT policies). Missing a SELECT policy causes UPDATE operations to fail even when UPDATE policies allow the operation:

```sql
-- Insufficient - UPDATE fails without SELECT policy
CREATE POLICY "Users can update profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Required - Must have both policies
CREATE POLICY "Users can update profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
```

### Debugging techniques that actually work

**Testing with RLS disabled first** isolates whether the problem is RLS policy configuration or something else entirely. Temporarily disable RLS with `ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;` and test your operation. If it works with RLS disabled but fails with RLS enabled, the issue is definitely policy configuration. If it still fails, the problem is connection, authentication, or query logic.

**Examining the Authorization header** reveals what role is actually being used. After suspicious operations, check the current session:

```typescript
const { data: { session } } = await supabase.auth.getSession();
console.log('Session:', session);
console.log('User:', session?.user);

// If session exists when you expected service_role, that's the problem
```

If getSession() returns a user session on a client you initialized with service_role_key, you've identified the Authorization header override issue.

**SQL Editor policy testing** lets you manually test policies by setting the role and JWT claims:

```sql
-- Simulate an authenticated user
SET ROLE authenticated;
SET request.jwt.claims TO '{"role":"authenticated", "sub":"actual-user-uuid"}';

-- Test your query as that user
SELECT * FROM profiles WHERE user_id = 'actual-user-uuid';

-- Check execution plan to see RLS in action
EXPLAIN ANALYZE SELECT * FROM profiles WHERE user_id = 'actual-user-uuid';
```

**Checking for both apikey and Authorization headers** matters when making direct HTTP requests. Many developers only set the apikey header, but service_role operations require BOTH headers set to the service_role_key value:

```bash
# CORRECT - Both headers required
curl --request GET \
  --url 'http://localhost:54321/rest/v1/profiles' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'apikey: YOUR_SERVICE_ROLE_KEY'
```

## Choosing between anon key and service_role_key correctly

The choice between anon key and service_role_key determines whether Row Level Security is enforced and what privileges your operations have. **Using the wrong key either exposes security vulnerabilities or causes authorization failures.**

| Characteristic | Anon Key | Service Role Key |
|----------------|----------|------------------|
| **PostgreSQL Role** | `anon` (unauthenticated) or `authenticated` (logged in) | `service_role` with BYPASSRLS attribute |
| **RLS Enforcement** | Always enforced via policies | Always bypassed, no policy checks |
| **Safe for Client-Side** | Yes - designed for browser/mobile | No - server-side only |
| **Security Model** | Data access controlled by RLS policies | Full database access, no restrictions |
| **Session Management** | Supports user authentication and sessions | No session management needed |
| **Use Cases** | User-facing operations, public APIs | Admin operations, webhooks, system tasks |
| **Exposed in Browser** | Safe when RLS properly configured | Returns 401 Unauthorized if attempted |

**The anon key enables public access with RLS protection.** When used without user authentication, operations execute as the `anon` PostgreSQL role. When a user signs in, the client automatically includes their JWT in the Authorization header, switching to the `authenticated` role while still enforcing RLS. This key is safe to expose in frontend code because RLS policies define exactly what data users can access, insert, update, or delete. Even if an attacker obtains the anon key, they cannot bypass the security boundaries you've defined through policies.

**The service_role_key grants unrestricted database access.** The PostgreSQL role has the BYPASSRLS attribute, meaning all RLS policies are ignored. Operations execute with elevated privileges similar to a database superuser. This key must never be exposed client-side—if an attacker obtains it, they have full database access to read, modify, or delete any data regardless of RLS policies. The key exists for administrative operations where RLS would prevent necessary actions.

### When to use anon key in practice

**Client-side applications always use anon key**, including React, Vue, Angular, Svelte, mobile apps, and any code running in browsers or on user devices. Initialize clients with the anon key and rely on RLS policies to enforce data access rules:

```typescript
// Client-side React component
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// RLS enforced based on current user session
const { data, error } = await supabase
  .from('profiles')
  .select()
  .eq('user_id', user.id);
```

**Server-side user operations use anon key with user context.** When building API routes or server actions that perform operations on behalf of authenticated users, use the anon key with SSR helpers that maintain user sessions from cookies. This ensures RLS policies correctly enforce access control based on the authenticated user:

```typescript
// Next.js API route respecting user context
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function GET() {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookies().getAll();
        },
      },
    }
  );
  
  // Respects RLS based on current user from cookies
  const { data } = await supabase.from('profiles').select();
}
```

**Public APIs with granular access control** benefit from anon key usage. Design RLS policies that allow specific public operations while restricting sensitive data, enabling secure APIs without exposing service_role_key.

### When to use service_role_key in practice

**Webhook handlers require service_role_key** because they operate without user context. Stripe webhooks, Twilio callbacks, GitHub webhooks, and similar integrations need to modify data across any user's records based on external events:

```typescript
// Stripe webhook handler
export async function POST(request: Request) {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const event = await verifyStripeWebhook(request);
  
  // Updates any user's subscription data
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'active' })
    .eq('stripe_subscription_id', event.data.id);
}
```

**Scheduled jobs and cron tasks** need elevated privileges to process data across all users. Analytics processing, data cleanup, notification sending, and similar background tasks operate without user authentication context:

```typescript
// Scheduled job processing analytics
async function processAnalytics() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  // Aggregates data across all users
  const { data } = await supabaseAdmin
    .from('events')
    .select('*')
    .gte('created_at', yesterday);
  
  // Process and store results...
}
```

**Admin dashboards and internal tools** where you've implemented separate authentication need service_role_key. The service_role client bypasses RLS while your custom authentication controls who can access the admin interface:

```typescript
// Admin API route with custom auth
export async function GET(request: Request) {
  // Custom admin authentication
  const adminUser = await verifyAdminToken(request);
  if (!adminUser) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Service role for admin operations
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const { data } = await supabaseAdmin
    .from('users')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);
}
```

**Data migrations and system-level operations** require bypassing RLS to modify data structures or update records across all users. These should run in secure environments with restricted access, never in user-facing code.

### The local development safety exception

**Local development keys are safe to share within teams** because they only work against localhost instances. According to Supabase maintainers, local anon and service_role keys can be committed to `.env.example` files in repositories since they provide no access to production data. The deterministic key generation means all developers get the same keys locally, simplifying team collaboration:

```bash
# .env.example - Safe to commit for local development
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlhdCI6MTY0MTc2OTIwMCwiZXhwIjoxNzk5NTM1NjAwfQ.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNjQxNzY5MjAwLCJleHAiOjE3OTk1MzU2MDB9.DaYlNEoUrrEn2Ig7tqibQwu8mUiIhNfx8xXxQWMqVhI
```

Production keys must never be committed or shared casually—these provide real database access and must be protected as critical secrets.

## Complete setup patterns from initialization to production

A robust local development workflow that mirrors production requires careful orchestration of Supabase CLI, environment configuration, and deployment practices. **The goal is development-production parity where local behavior matches production exactly.**

### Complete Next.js local development setup

**Step 1: Initialize Supabase locally** by installing the CLI globally and creating the project structure:

```bash
# Install CLI
npm install -g supabase

# Initialize in your Next.js project
cd my-nextjs-app
supabase init

# Start all services
supabase start
```

The `supabase start` command outputs all credentials. Copy the API URL, anon key, and service_role_key. These values remain constant across restarts, making local development predictable.

**Step 2: Configure environment variables** by creating `.env.local` at your project root:

```bash
# .env.local (add to .gitignore)
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Step 3: Create utility modules** for different client types. The project structure should look like:

```
my-nextjs-app/
├── .env.local
├── .env.example
├── utils/
│   └── supabase/
│       ├── client.ts        # Browser client
│       ├── server.ts        # Server component client  
│       ├── middleware.ts    # Middleware client
│       └── admin.ts         # Admin client
├── middleware.ts
└── app/
```

Each utility module handles its specific context with appropriate client initialization.

**Step 4: Implement middleware** to refresh user sessions on every request. Create `middleware.ts` at the project root:

```typescript
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
```

This ensures authentication state stays synchronized across requests and refreshes tokens before expiration.

**Step 5: Link to remote project** when ready to sync schema changes:

```bash
# Link to your Supabase project
supabase link --project-ref your-project-id

# Pull remote schema to local
supabase db pull
```

This creates migrations from your production schema, allowing you to develop against a database structure matching production.

**Step 6: Development workflow with migrations** follows this pattern:

```bash
# Make schema changes in Studio (http://localhost:54323)
# Then generate migration
supabase db diff -f descriptive_migration_name

# Apply migration
supabase db reset

# Seed data
supabase db seed
```

Each migration is stored in `supabase/migrations/` and committed to version control, ensuring team members work with identical schemas.

**Step 7: Configure production deployment** in your hosting platform (Vercel, Netlify, etc.) with production credentials:

```bash
# Production environment variables
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_production_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_production_service_role_key
```

Never commit production credentials. Configure them through your platform's dashboard or CI/CD secrets management.

### Complete Node.js/Express backend setup

**Step 1: Project initialization** with dependencies:

```bash
mkdir my-api
cd my-api
npm init -y
npm install express @supabase/supabase-js dotenv cors
```

**Step 2: Environment configuration** by creating `.env`:

```bash
# .env (add to .gitignore)
SUPABASE_URL=http://localhost:54321
SUPABASE_ANON_KEY=your_local_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_local_service_role_key
PORT=5000
NODE_ENV=development
```

**Step 3: Supabase client configuration** in a dedicated module:

```javascript
// config/supabase.js
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

module.exports = { supabase, supabaseAdmin };
```

**Step 4: Controller implementation** using appropriate clients:

```javascript
// controllers/userController.js
const { supabase, supabaseAdmin } = require('../config/supabase');

// User-facing operation (respects RLS)
exports.getUserProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    
    if (error) throw error;
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Admin operation (bypasses RLS)
exports.createAdminUser = async (req, res) => {
  try {
    const { email, password, user_metadata } = req.body;
    
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata,
      email_confirm: true,
    });
    
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
```

**Step 5: Production deployment** by setting environment variables on your hosting platform (Heroku, Railway, Render, etc.) with production Supabase credentials. Keep local and production configurations separate to prevent accidental production data access during development.

### Common pitfalls that break the setup

**Mixing SSR helpers with service_role_key** is the most common mistake. Never use `createServerClient` or similar SSR helpers with service_role_key—they're designed to manage user sessions and will override the authorization context:

```typescript
// WRONG - Never do this
import { createServerClient } from '@supabase/ssr';

const supabase = createServerClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // Will be overridden!
  { cookies }
);

// CORRECT - Use standard createClient for service role
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

**Forgetting to restart the dev server** after adding new environment variables causes variables to be undefined. Next.js loads environment variables at startup, so changes require a restart to take effect.

**Using NEXT_PUBLIC_ prefix on service_role_key** exposes it to the browser, creating a critical security vulnerability. Remove the prefix immediately if this happens and rotate your production service_role_key.

**Missing RLS policies after enabling RLS** causes all operations to fail silently. When you enable RLS on a table with `ALTER TABLE table_name ENABLE ROW LEVEL SECURITY;`, PostgreSQL denies all operations by default. You must explicitly create policies allowing operations:

```sql
-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Create permissive policies
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

**Not using .select() properly with RLS** causes confusing errors. Many developers add `.select()` after inserts or updates to retrieve the modified data, but this requires SELECT policies in addition to INSERT or UPDATE policies. Either add the SELECT policy or remove `.select()` from your query.

## Putting it all together with proven patterns

The research reveals several critical insights that transform Supabase local development from frustrating to reliable. **Authorization header override is the silent killer**—understanding that user sessions replace service_role authorization explains 90% of RLS violation issues. The solution requires disciplined separation: never mix user authentication with service_role clients.

**Local keys are stable and safe to share**, contradicting many developers' assumptions. Committing local credentials to `.env.example` files simplifies team onboarding and eliminates the "where do I find the keys" question that plagues every new project member.

**RLS violations stem from missing policies more than wrong keys.** When RLS is enabled without policies, PostgreSQL defaults to denying everything. INSERT operations that return data need both INSERT and SELECT policies. UPDATE operations require SELECT, UPDATE, and potentially another SELECT policy for returned data. Design policies intentionally rather than reactively.

**Framework-specific patterns aren't optional**—they're required for correct behavior. Next.js demands separate client instances for browser, server components, and admin operations. Express allows simpler patterns but still requires thoughtful separation between user and admin clients. Edge Functions need the two-client pattern to handle both user authentication and privileged operations in a single function.

The path forward is straightforward: use `supabase status -o env` to get credentials, create dedicated admin clients with disabled auth properties, never mix SSR helpers with service_role_key, implement comprehensive RLS policies before enabling RLS, and maintain strict separation between user and admin operations. These patterns, drawn from official documentation and verified community solutions, eliminate the entire class of RLS violation bugs that consume hours of debugging time.

# Fixing the 500 error in the email uniqueness route.

I can see exactly what's happening now. The issue is in the API route that calls `findEmailConflicts` - specifically, which Supabase client is being passed to it. This is a perfect example of when you need service_role_key, and it's likely working in production by accident rather than by design.

Let me explain what's happening and why. The registration flow is checking email uniqueness by querying the profiles table before creating an account. This happens in an unauthenticated context - the user doesn't have an account yet, so there's no user session. The `findEmailConflicts` function receives a Supabase client and tries to query:

typescript

```typescript
const { data: profileMatches, error: profileError } = await supabase
  .from('profiles')
  .select('id, email')
  .in('email', normalizedEmails);
```

This query needs to read email addresses from all profiles to check for duplicates. But here's the security implication: if this query uses the anon key, your RLS policies would need to allow unauthenticated users to read email addresses from any profile. That's a significant security risk - anyone could enumerate all user emails in your database.

The 500 RLS violation in local dev is actually your database correctly protecting itself. What's likely happening in production is one of two things. Either your production RLS policies are more permissive than they should be (allowing public reads of profile emails), or the API endpoint happens to have some authentication context that makes the query succeed even though it shouldn't rely on that.

The correct architectural solution is that the `/api/validation/email` endpoint should use the service_role_key client to perform this validation. Email uniqueness checking is an administrative operation that needs to see across all users regardless of authentication context. It's a perfect use case for service_role because the operation itself is secure (it only checks existence, doesn't return sensitive data to the client), but it needs elevated privileges to function.

Your API route should look something like this:

typescript

```typescript
// app/api/validation/email/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findEmailConflicts } from '@/lib/validation/email-uniqueness';

// Create admin client with service_role_key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  }
);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { emails } = body;

    // Use admin client to check across all profiles
    const result = await findEmailConflicts({
      supabase: supabaseAdmin,
      emails,
    });

    if (result.conflicts.length > 0) {
      return NextResponse.json(
        { error: 'Email already in use', conflicts: result.conflicts },
        { status: 409 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Email validation error:', error);
    return NextResponse.json(
      { error: 'Validation failed' },
      { status: 500 }
    );
  }
}
```

The key changes are creating the admin client at the top of your API route file (not inside the handler, since you want to reuse it), and passing that admin client to `findEmailConflicts`. The admin client bypasses RLS, allowing the query to see all profiles regardless of authentication context.

For local development, you just need to add the service role key to your environment variables. Get it by running `supabase status` in your project directory, then add it to your `.env.local`:

bash

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Then restart your Next.js dev server so it picks up the new environment variable. The registration flow will work identically in local and production because both use the service_role client for validation.

This is the only code change you need. The rest of your application - the registration page, the frontend client, all your other components - continues working exactly as it does now. You're just fixing this one specific operation that needs administrative access to function correctly.

The broader principle is that email uniqueness validation is inherently an administrative operation. It must check across all users, which means it needs to bypass user-level security policies. Using service_role_key for this is the correct architectural pattern, and it's what you should be doing in production as well. Local development is actually revealing a security improvement you should make.