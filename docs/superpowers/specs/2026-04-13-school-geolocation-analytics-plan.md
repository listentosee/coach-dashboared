# School Geolocation Analytics Plan

## Purpose

Add a simple school geolocation workflow so the admin analytics section can display the geographic distribution of participating schools.

This is a standalone feature and is not part of the certificate/survey project.

## Goal

Store one geolocation payload on the coach profile at registration time and reuse it later for map display.

Keep it minimal:

- one JSONB field on `profiles`
- one geocoding step during coach registration
- one analytics map view that reads stored coordinates

## Recommended Data Model

Add one field to `profiles`:

- `school_geo jsonb`

Suggested payload:

```json
{
  "lat": 34.1083,
  "lon": -117.2898
}
```

No additional geocode metadata is required in v1.

## Why This Design

- simple to query
- flexible enough for future additions if needed
- avoids extra tables
- avoids repeated live geocoding on analytics pages

## Trigger Point

Geocode only once when the coach registers.

Flow:

1. Coach is verified through the Monday-backed registration flow
2. Coach registration creates the `profiles` row
3. The app geocodes the school location
4. The app stores the coordinates in `profiles.school_geo`

Do not geocode during analytics page loads.

## Current Data Inputs

The current registration flow appears to have:

- `school_name`
- `region`

It does not appear to store a full school street address in the registration flow today.

That means the initial geocoding query will be school-name based, not address-based.

## Geocoding Query Strategy

Use a simple query string such as:

- `<school_name>, Inland Empire, California`

or:

- `<school_name>, <region>, California`

This is sufficient for a first-pass map of participating schools.

## Important Caveat

Because the input is based on school name instead of a precise address:

- some schools may geocode imperfectly
- some common school names may be ambiguous

This is acceptable for v1.

If better precision is needed later, the next step should be to store a canonical school address upstream and geocode that instead.

## Geocoding Provider

Use a simple geocoding API suitable for school-name lookup.

Recommended options:

1. U.S. Census Geocoder
2. MapTiler Geocoding API

For this feature, the main requirement is:

- return lat/lon once during registration

No advanced GIS functionality is needed from the geocoder.

## Registration Integration

Update the coach registration path so that after the profile is created:

1. Build a geocoding query from `school_name` and `region`
2. Call the geocoding provider
3. If a result is returned, write:

```json
{
  "lat": <number>,
  "lon": <number>
}
```

to `profiles.school_geo`

If geocoding fails:

- do not fail registration
- leave `school_geo` null

This must be graceful degradation, not a blocking requirement for coach onboarding.

## Analytics Usage

For the admin analytics school map:

1. Query coach profiles
2. Filter to rows where `school_geo` is not null
3. Read:
   - `school_geo.lat`
   - `school_geo.lon`
4. Plot one point per coach school

Optional filters later:

- division
- region
- approval status

## Admin Analytics Scope

The initial map only needs to answer:

- where are participating schools located?

It does not need:

- routing
- polygons
- district boundaries
- travel-time analysis
- live geocoding

## Failure Handling

If no geocode is found:

- keep registration successful
- store no coordinates
- exclude that school from the map until corrected

This avoids introducing operational fragility into coach onboarding.

## Non-Goals

- no separate geocode history table
- no geocode audit log in v1
- no full address normalization project
- no GIS warehouse
- no repeated background refresh jobs

## Recommended Implementation Order

1. Add `school_geo jsonb` to `profiles`
2. Pick the geocoding provider
3. Add geocoding to coach registration
4. Gracefully handle null/unresolved results
5. Add school map display in `admin-tools/analytics`

## Recommendation

Execute this now as a small standalone feature:

- one profile field
- one geocode call at registration
- one analytics map consumer

That is enough to support school distribution reporting without overengineering it.

## Execution Checklist

### Phase 1: Data Model

- [ ] Add `school_geo jsonb` to `profiles`
- [ ] Confirm the JSON shape is exactly:

```json
{
  "lat": <number>,
  "lon": <number>
}
```

- [ ] Do not add any extra geocode metadata fields in v1

Acceptance:

- `profiles` can store `school_geo`
- existing profile queries continue to work

### Phase 2: Provider Choice

- [ ] Choose the geocoding provider
- [ ] Add required environment variables
- [ ] Confirm the provider returns usable lat/lon for school-name queries

Acceptance:

- one known school can be geocoded successfully from a test query

### Phase 3: Registration Integration

- [ ] Update coach registration flow to geocode after profile creation
- [ ] Build geocoding query from `school_name` and `region`
- [ ] Write the resulting coordinates to `profiles.school_geo`
- [ ] Keep registration successful even if geocoding fails

Acceptance:

- a newly registered coach with a resolvable school gets `school_geo`
- a failed geocode does not block registration

### Phase 4: Failure Handling

- [ ] Leave `school_geo` null when no match is found
- [ ] Do not throw a registration-blocking error for geocode failures
- [ ] Log enough server-side detail to debug provider failures

Acceptance:

- unresolved schools do not break onboarding
- bad geocode responses are visible in logs

### Phase 5: Analytics API/Data Access

- [ ] Add the needed profile fields to the analytics data source
- [ ] Filter to coaches with non-null `school_geo`
- [ ] Expose `school_geo.lat` and `school_geo.lon` to the analytics page

Acceptance:

- analytics page can load a list of school coordinates without live geocoding

### Phase 6: Map Display

- [ ] Add the school map to `admin-tools/analytics`
- [ ] Plot one point per coach school
- [ ] Handle missing coordinates gracefully
- [ ] Keep the first version focused on point display only

Acceptance:

- admin can open analytics and see school distribution on a map
- rows without coordinates do not break the page

### Phase 7: Validation

- [ ] Register a test coach with a known school
- [ ] Confirm `school_geo` is written on the profile
- [ ] Confirm the analytics page renders that school on the map
- [ ] Confirm registration still works if geocoding is unavailable

Acceptance:

- successful path verified
- graceful-degradation path verified

## Implementation Notes

- Do not geocode on analytics page load
- Do not add a background sync job in v1
- Do not introduce a separate geolocation table
- Do not expand the payload beyond `lat` and `lon`

## Definition of Done

- `profiles.school_geo` exists
- coach registration attempts one geocode lookup
- successful geocode writes `{ "lat": ..., "lon": ... }`
- failed geocode does not block registration
- admin analytics displays mapped schools using stored coordinates
