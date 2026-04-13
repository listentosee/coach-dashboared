# Competition Certificates Plan

## Purpose

Add a simple admin workflow to:

1. Generate participation certificates for active competitors
2. Store the generated PDFs in Supabase Storage using the student ID as the filename
3. Email each competitor a certificate claim link using the existing mailer service
4. Require a Fillout survey before download
5. Track whether the link was received/opened and whether the certificate was downloaded
6. Store Fillout survey responses in JSONB for later reporting and demographic analysis

This document is for review before implementation. It is intentionally minimal.

## Assumptions

- Survey collection will be handled by **Fillout.com**, not by building survey forms in this app.
- Bulk email delivery will use the **existing competitor/student mailer flow** already in the dashboard.
- Certificate PDFs will be stored in **Supabase Storage**.
- The certificate template file will live at:
  - `public/certificate/Certificate-2026.pdf`
- The PDF should be personalized by replacing the `{{competitor}}` placeholder with the competitor name.
- “Active competitors” means competitors with recent competition activity. The exact rule should be confirmed before implementation.

## Goals

- Keep the implementation small
- Reuse existing mailer and tracking patterns
- Avoid introducing a new survey system into the dashboard app
- Avoid creating a large new campaign framework unless the existing mailer absolutely requires a minimal companion table
- Preserve Fillout responses in a form that can be joined back to competitor demographics

## Proposed Scope

### 1. Certificate Generation

Add one admin action that:

- finds eligible competitors
- generates one certificate PDF per competitor
- saves the PDF to Supabase Storage under a deterministic path based on student ID
- stores the storage path so the app can later serve the PDF

### 2. Email Delivery

Add one admin action that:

- selects competitors with generated certificates
- creates a unique claim token per competitor
- sends certificate emails through the existing mailer service
- includes a claim URL in the email

### 3. Survey Gate

The app should not host survey questions.

Instead:

- the claim flow redirects the student to Fillout, or presents a Fillout link
- Fillout submits a webhook back to this app when the survey is completed
- the app stores the Fillout submission in a JSONB results table
- the app marks that student/token as survey-complete
- only then may the certificate be downloaded

### 4. Download Tracking

Track only the basics:

- `survey_completed_at`
- `downloaded_at`
- `download_count`

Optional if already easy through the current mailer:

- `emailed_at`
- `opened_at`
- `clicked_at`

## Minimal Data Design

Prefer a **small extension table** over modifying the competitor table with several one-off fields.

### Option A: Recommended

Create two small tables:

1. `competitor_certificates`
2. `competitor_certificate_survey_results`

#### `competitor_certificates`

Columns like:

- `id`
- `competitor_id`
- `student_id`
- `certificate_year`
- `storage_path`
- `claim_token`
- `emailed_at`
- `opened_at`
- `clicked_at`
- `survey_completed_at`
- `downloaded_at`
- `download_count`
- `fillout_submission_id`
- `created_at`
- `updated_at`

#### `competitor_certificate_survey_results`

Columns like:

- `id`
- `competitor_id`
- `competitor_certificate_id`
- `fillout_submission_id`
- `fillout_form_id`
- `submitted_at`
- `results_jsonb`
- `created_at`

Suggested `results_jsonb` contents:

- raw Fillout answers payload
- normalized question keys where easy to extract
- selected submission metadata from Fillout

Why this is preferred:

- keeps certificate concerns out of the main competitor record
- supports future years cleanly
- avoids cluttering `competitors`
- preserves survey data for later analysis without forcing every question into its own SQL column

### Option B: Acceptable only if the team wants maximum simplicity

Add a few fields directly to `competitors`, but this is less clean if certificates become annual.

Not recommended unless this is clearly a one-time feature.

## Storage Design

Use a dedicated private Supabase bucket such as:

- `competition-certificates`

Suggested file naming:

- `<student-id>.pdf`

Suggested path:

- `2026/<student-id>.pdf`

This is simple, predictable, and easy to stream through an app route.

## Route Plan

Keep the route surface small.

### Admin routes

- `POST /api/admin/certificates/generate`
  - find eligible competitors
  - generate and upload PDFs
  - upsert certificate records

- `POST /api/admin/certificates/send`
  - send certificate emails through the existing mailer path
  - persist claim tokens if not already present

### Public/student routes

- `GET /certificate/claim/[token]`
  - validates token
  - shows status and next step
  - routes student to Fillout if survey not complete

- `POST /api/certificates/fillout/webhook`
  - receives Fillout completion event
  - stores the Fillout response payload in JSONB
  - marks survey complete for the matching competitor/token

- `GET /api/certificates/download/[token]`
  - validates token
  - checks `survey_completed_at`
  - streams the stored PDF
  - increments download tracking

## Fillout Integration Plan

Use Fillout in the simplest possible way while still preserving the response data for reporting.

- Include a stable identifier in the Fillout link, ideally the certificate claim token
- On completion, Fillout calls our webhook
- Webhook validates the request
- Webhook writes one row to `competitor_certificate_survey_results`
- Webhook marks the matching certificate record complete

Preferred matching key:

- `claim_token`

Fallback matching key:

- `competitor_id`

Persist only the survey data needed for traceability and later analysis:

- `fillout_submission_id`
- `fillout_form_id`
- `submitted_at`
- `results_jsonb`
- completion timestamp on the certificate record

Avoid building any internal survey-taking UI. The app only launches Fillout, receives the webhook, stores JSONB results, and gates download.

## Fillout Form Setup Guide

This is the minimum required Fillout setup for the certificate workflow.

### 1. Create one dedicated Fillout form

Create a single form specifically for certificate download gating.

Suggested form name:

- `2026 Competition Certificate Survey`

Do not reuse a general-purpose survey form. Keep this one tied to the certificate flow so the webhook and payload assumptions stay stable.

### 2. Register hidden fields / URL parameters

In Fillout form settings, register these URL parameters first.

Required:

- `claim_token`
- `competitor_id`
- `certificate_id`

Recommended:

- `student_id`
- `certificate_year`
- `survey_version`

Why:

- `claim_token` is the primary match key back to our app
- `competitor_id` is the fallback match key
- `certificate_id` is useful for debugging and joins
- the others help with traceability and versioning

Implementation note:

- these values should be passed from the claim page into the Fillout form URL or embed
- these fields should not be editable by the student

### 3. Add visible survey questions

Keep the survey short.

Recommended first-pass questions:

1. `overall_experience`
   - single select
   - example labels: Excellent, Good, Okay, Poor
2. `difficulty_level`
   - single select
   - example labels: Too easy, About right, Too hard
3. `would_participate_again`
   - single select
   - values: `yes`, `no`
4. `favorite_part`
   - long text
5. `improvement_feedback`
   - long text

Optional:

6. `career_interest_change`
   - single select
7. `team_experience`
   - single select or long text

Important requirement:

- use stable internal question names and do not casually rename them after launch

We are storing full payloads in JSONB, but stable naming still matters for later reporting.

### 4. Use custom option values

For all multiple-choice or dropdown questions, configure Fillout custom values.

Example:

- label: `About right`
- stored value: `about_right`

This avoids reporting problems caused by label changes later.

### 5. Hide tracking fields from respondents

If any of the tracking values are surfaced as fields in the form, configure them so the respondent cannot change them.

Requirement:

- tracking fields must be treated as hidden/pre-filled values only
- students should never edit `claim_token`, `competitor_id`, or `certificate_id`

### 6. Choose the in-app presentation mode

Your answer in the spec says Fillout should be handled **in app**.

That means the app should embed the Fillout form inside the certificate claim experience instead of sending the student to a separate standalone Fillout page.

Requirement:

- use one embedded Fillout form in the claim page
- pass the hidden fields into the embed
- keep the surrounding app page responsible for access control and post-submit download flow

### 7. Configure webhook delivery

In Fillout:

- open `Integrate`
- choose `Webhook`
- configure the webhook endpoint to our app

Planned endpoint:

- `POST /api/certificates/fillout/webhook`

Requirements for the webhook:

- send submission events on completed submissions
- include the hidden field values in the payload
- preserve the full response payload sent by Fillout
- use Fillout’s webhook testing before publishing

App-side expectations:

- the webhook handler will store the full payload in `results_jsonb`
- the handler will also extract `claim_token`, `competitor_id`, `fillout_submission_id`, `fillout_form_id`, and `submitted_at`
- the handler will mark `survey_completed_at` on the certificate record

### 8. Configure the ending behavior

Keep the post-submit experience simple.

Recommended behavior:

- after successful submission, Fillout should redirect back to the app claim page

Suggested target:

- `/certificate/claim/[token]?survey=complete`

If the redirect target needs query params, map the token from the hidden field.

Requirement:

- the redirect must bring the student back into the app flow where the download button is shown

### 9. Publish only after this payload checklist is satisfied

Before the form goes live, verify that one test submission includes:

- hidden `claim_token`
- hidden `competitor_id`
- hidden `certificate_id`
- Fillout submission ID
- Fillout form ID
- submission timestamp
- full answer payload

If any of those are missing, the webhook integration is not ready.

### 10. Reporting-oriented requirements

Because this survey will later be analyzed against competitor demographics, keep these rules in place:

- do not frequently rename survey questions
- do not frequently change option values
- if a question meaning changes, create a new question key instead of silently reusing the old one
- include a `survey_version` hidden parameter so submissions can be grouped by version later

This will make JSONB analysis much easier when joining against:

- `grade`
- `division`
- `program_track`
- `gender`
- `race`
- `ethnicity`

### 11. Fillout admin checklist

The person setting up the form should confirm all of the following:

- one dedicated certificate survey form exists
- hidden fields are registered
- all answer options use stable custom values
- the form is embedded in-app, not linked as a detached external survey
- webhook is configured and tested
- ending page redirects back to the app
- one end-to-end test submission successfully unlocks a certificate record

### 12. Initial v1 constraints

Keep the Fillout setup lean:

- one form
- one webhook
- one redirect target
- one survey version at launch

Do not introduce:

- multiple Fillout forms by division
- branching into many endings unless required
- advanced integration chains outside the app webhook
- a second reporting store outside Supabase

## Mailer Integration Plan

Reuse the current student/competitor mailer pattern.

Certificate emails only need:

- recipient email
- subject
- body
- claim link

If the existing mailer already supports open/click tracking, reuse it.

Do not build a second large campaign system unless the current mailer cannot send individualized links without a minimal helper table.

## Eligibility Rule To Confirm

This must be decided before coding.

Suggested definition:

- competitor is active
- has a student/game-platform ID
- has at least one of:
  - `last_login_at`
  - recent challenge solve activity
  - recent flash CTF activity

Open question:

- should “active” mean **any activity during the season**, or **activity within a rolling recent window**?

## Admin UI Plan

Keep UI small. One page under admin tools is enough.

Sections:

1. Preview eligible competitor count
2. Generate certificates
3. Send certificate emails
4. View simple status counts

No heavy dashboarding is needed in the first pass.

## Tracking Plan

Track only what matters to operations:

- certificate generated
- email sent
- email opened/clicked if available through existing mailer tracking
- Fillout survey completed
- certificate downloaded

No separate analytics service is needed in the first version.

For reporting:

- store Fillout results in JSONB
- join `competitor_certificate_survey_results` back to `competitors`
- analyze later by demographic strata such as grade, division, program track, gender, race, and ethnicity

## Non-Goals

- No new internal survey builder
- No large campaign management UI
- No multi-template system
- No annual certificate management framework beyond a `certificate_year` field
- No public signed URLs if the app can stream the file directly
- No complex event-sourcing model
- No attempt to flatten every Fillout answer into first-class SQL columns in v1

## Open Questions

1. What exact rule defines an “active” competitor for certificate eligibility? A: with GP ID and any activity.
2. Should the Fillout step be an in-app redirect, or should the claim page show a button to open Fillout? A: in app
3. Does the existing mailer already support per-recipient merge values cleanly, or do we need a very small helper layer for unique links? A: Mailer does not currently support merge. Will need to provide this
4. Should a student be allowed to download multiple times, or only once? A: yes
5. Should coaches/admins have a manual “mark survey complete” override? A: no
6. Should we store the full Fillout webhook payload, or just the extracted response block plus selected metadata? A: full payload would be helpful during development

## Recommended Implementation Order

1. Confirm eligibility rule
2. Confirm Fillout webhook payload and identifier strategy
3. Add minimal certificate table
4. Add minimal JSONB survey results table
5. Implement certificate generation/upload
6. Implement claim token + email send
7. Implement Fillout webhook completion handling + JSONB storage
8. Implement gated download route
9. Add a small admin page for preview/generate/send

## Recommendation

Build this as a **thin certificate feature**:

- one small certificate table
- one small JSONB survey results table
- one storage bucket
- one admin page
- one Fillout webhook
- one gated download route

Anything beyond that should be deferred unless a real requirement appears during implementation.
