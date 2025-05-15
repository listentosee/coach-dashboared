# Coach Dashboard Project - Architecture & Tech Stack Reference

## 1. Airtable as Primary Data Source
- Airtable is used for flexible data modeling, automations, and integrations (e.g., Make.com, Zapier).
- The Coach record ID is the key for access control and filtering across related tables.

## 2. Automated Coach Auth Record Creation
- When a new Coach record is created in Airtable, an automation triggers a webhook to the Next.js app.
- The webhook endpoint creates a corresponding authentication record in the app (e.g., in Supabase Auth), linking the Airtable Coach record ID.
- This keeps authentication and Airtable data in sync, and can be used to send invites or set up passwords.

## 3. Tech Stack: shadcn/ui and Tailwind
- The UI uses Next.js and shadcn/ui, which is built on top of Tailwind CSS.
- Tailwind is a required dependency for shadcn/ui and is already included in the project (see `tailwind.config.ts`).

## 4. Stack Summary
- **Frontend/UI:** Next.js + shadcn/ui (with Tailwind CSS)
- **Auth:** Supabase Auth (or a custom system, but Supabase is recommended for easy integration)
- **Data:** Airtable (accessed via Personal Access Token from the backend)
- **Automations:** Airtable Automations + Webhooks to Next.js API routes

## 5. Recommended Next Steps
1. Set up Supabase Auth (or your chosen auth system) for coach authentication.
2. Create a Next.js API route to receive Airtable automation webhooks for new Coach records.
3. In the webhook handler, create a new auth user (if not already present) and link the Airtable Coach record ID.
4. In your app, when a coach logs in, use their linked Airtable Coach record ID to filter all data access.

---

Refer to this section for architectural decisions and integration patterns as you build and scale the project.
