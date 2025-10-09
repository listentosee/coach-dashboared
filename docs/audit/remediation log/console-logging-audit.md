# Console Logging Audit Report
## FERPA Issue #2: PII Removal from Logs

Generated: 2025-10-08

This document catalogs all `console.log/error/warn/info/debug` calls in API routes to determine which should be:
- **REMOVED** - Development/debugging only
- **SIMPLIFIED** - Reduce verbosity, remove PII
- **REPLACED** - Convert to safe logger with sanitization

---

## Legend

- 🔴 **CRITICAL** - Logs PII (names, emails, etc.) - must be fixed immediately
- 🟡 **MODERATE** - May contain sensitive data or overly verbose
- 🟢 **LOW** - Safe, but should use safe logger for consistency
- ❌ **REMOVE** - Debug-only, can be deleted
- ✏️ **SIMPLIFY** - Keep but reduce detail

---

## Summary Statistics

- Total files with console calls: 71
- Total console statements found: ~200+
- Critical PII exposures: ~15-20
- Development debug calls: ~50+

---

## Critical PII Exposures (🔴 HIGH PRIORITY)

### app/api/competitors/create/route.ts
```typescript
Line 43: console.log('Validated data:', validatedData);
         🔴 CRITICAL - Logs full competitor data (first_name, last_name, emails)
         ✏️ REPLACE: logger.info('Competitor validation successful', { game_platform_id, division })

Line 74: console.log('Inserting competitor with data:', insertData);
         🔴 CRITICAL - Logs full competitor PII
         ❌ REMOVE or ✏️ REPLACE: logger.info('Creating competitor', { coach_id, division })

Line 87: console.log('Competitor created successfully:', competitor);
         🔴 CRITICAL - Logs full competitor object with PII
         ✏️ REPLACE: logger.info('Competitor created', { competitor_id: competitor.id })
```

### app/api/competitors/[id]/update/route.ts
```typescript
Line 83: console.error('Competitor update error:', upErr, 'payload:', updatePayload);
         🔴 CRITICAL - Logs payload with PII (first_name, last_name, emails)
         ✏️ REPLACE: logger.error('Competitor update failed', { error: upErr.message, competitor_id })
```

### app/api/zoho/send/route.ts ⚠️ MOST CRITICAL FILE
```typescript
Line 13: console.log('Zoho send API called with:', { competitorId: req.body });
         ❌ REMOVE - Debug only

Line 16: console.log('Parsed request:', { competitorId, mode });
         🟢 SIMPLIFY: logger.info('Zoho send initiated', { competitorId, mode })

Line 19: console.log('Supabase client created');
         ❌ REMOVE - Unnecessary debug

Line 50: console.log('Raw competitor data from Supabase:', c);
         🔴 CRITICAL - Logs FULL competitor object with all PII
         ❌ REMOVE

Line 64: console.log('Competitor data fetched:', {
           id: c.id,
           name: `${c.first_name} ${c.last_name}`,
           isAdult: c.is_18_or_over,
           email: c.is_18_or_over ? c.email_school : c.parent_email
         });
         🔴 CRITICAL - Logs name and email
         ✏️ REPLACE: logger.info('Competitor fetched for Zoho', { competitor_id: c.id, isAdult })

Line 92: console.log('Template selection:', { isAdult, templateId, templateKind });
         🟢 LOW - Safe but verbose
         ✏️ SIMPLIFY: logger.info('Template selected', { templateKind })

Line 94-96: console.log('Getting Zoho access token...');
            console.log('Access token retrieved:', accessToken ? 'Success' : 'Failed');
         ❌ REMOVE - Debug only

Line 127-148: Multiple template/action logging
         ❌ REMOVE - All debug only

Line 203: console.log('Field data being sent:', field_data);
         🔴 CRITICAL - Logs participant_name, school, grade
         ✏️ REPLACE: logger.info('Zoho field data prepared', { hasParticipantName: !!field_data.field_text_data.participant_name })

Line 212-341: 15+ console.log/error calls
         🟡 MODERATE - Mix of debug and errors
         Recommendation: Remove debug, convert errors to logger.error()
```

### app/api/competitors/bulk-import/route.ts
```typescript
Line 170: console.error('Bulk import error', e)
         🟡 MODERATE - May contain PII from import payload
         ✏️ REPLACE: logger.error('Bulk import failed', { error: e.message })
```

### app/api/competitors/profile/[token]/send-participation/route.ts
```typescript
Line 123: console.error('send-participation error', e)
         🟡 MODERATE
         ✏️ REPLACE: logger.error('Send participation failed', { error: e.message, token })
```

---

## Safe/Low Priority Console Calls (🟢)

### app/api/teams/**/*.ts
Most team-related logging appears safe (no PII), but should use safe logger for consistency:

```typescript
app/api/teams/[id]/route.ts
app/api/teams/create/route.ts
app/api/teams/[id]/members/add/route.ts
```

**Recommendation**: Batch convert all to logger.error() for errors

### app/api/admin/**/*.ts
Admin routes have standard error logging:

```typescript
app/api/admin/jobs/create/route.ts
app/api/admin/cron-jobs/route.ts
etc.
```

**Recommendation**: Convert to logger.error() - low priority

### app/api/messaging/**/*.ts
Messaging routes (~20 files) mostly have generic error logging

**Recommendation**: Batch convert - medium priority

---

## Development Debug Calls (❌ REMOVE)

### app/api/zoho/send/route.ts
- Lines 13, 16, 19, 94-96, 127-148, 212-341 (most console.log)
- **Action**: Remove entirely or convert only errors to logger.error()

### app/api/zoho/upload-manual/route.ts
```typescript
Line 92: console.log('Zoho request recalled successfully');
Line 95: console.warn('Failed to recall Zoho request:', ...);
Line 114: console.log('Zoho request deleted successfully');
```
**Action**: Remove success logs, convert warns to logger.warn()

---

## Recommended Action Plan

### Phase 1: Critical PII Fixes (IMMEDIATE - 2 hours)
1. ✅ app/api/competitors/create/route.ts - DONE
2. ✅ app/api/competitors/[id]/update/route.ts - DONE
3. app/api/zoho/send/route.ts - **IN PROGRESS**
   - Remove Lines 13, 19, 50, 94-96, 127-148 (debug only)
   - Replace Line 64 (logs name/email)
   - Replace Line 203 (logs participant data)
   - Convert errors to logger.error()
4. app/api/competitors/bulk-import/route.ts
5. app/api/competitors/profile/[token]/update/route.ts
6. app/api/zoho/upload-manual/route.ts

### Phase 2: Standard Error Logging (4 hours)
Convert all `console.error()` to `logger.error()` in:
- app/api/competitors/** (remaining files)
- app/api/teams/**
- app/api/messaging/**
- app/api/admin/**

### Phase 3: Cleanup (2 hours)
- Remove all debug console.log calls
- Test safe logger output
- Verify no PII in logs

---

## Specific Recommendations by File

### app/api/zoho/send/route.ts (369 lines)

**Remove entirely (❌):**
- Line 13: 'Zoho send API called with:'
- Line 19: 'Supabase client created'
- Line 50: 'Raw competitor data from Supabase:' (🔴 CRITICAL PII)
- Line 94: 'Getting Zoho access token...'
- Line 96: 'Access token retrieved:'
- Line 127: 'Fetching template details from Zoho...'
- Line 131: 'Template fetch response:'
- Line 140: 'Template data received:'
- Line 148: 'Action found:'
- Line 212: 'Print mode detected...'
- Lines 255, 273, 300, 302, 305, 308 (print mode debug logs)
- Lines 328, 338, 341, 349, 352, 368 (document creation debug logs)

**Replace with safe logger (✏️):**
- Line 16: → `logger.info('Zoho send initiated', { competitorId, mode })`
- Line 53: → `logger.error('Competitor not found', { competitorId })`
- Line 64: → `logger.info('Processing Zoho request', { competitor_id: c.id, isAdult })`
- Line 92: → `logger.info('Template selected', { templateKind })`
- Line 135: → `logger.error('Template fetch failed', { status, templateId })`
- Line 144: → `logger.error('No actions in template', { templateId })`
- Line 203: → `logger.debug('Field data prepared', { hasName: !!field_data.field_text_data.participant_name })`
- Line 249: → `logger.error('Print request failed', { status, error })`
- Line 269, 364: → `logger.error('Agreement creation failed', { error })`
- Line 344: → `logger.error('Document creation failed', { status, error })`

**Estimated reduction:** 30+ console calls → 10 safe logger calls

---

## Testing Checklist

After migration:
- [ ] Test competitor creation - verify no PII in logs
- [ ] Test competitor update - verify no PII in logs
- [ ] Test Zoho send (email mode) - verify no PII in logs
- [ ] Test Zoho send (print mode) - verify no PII in logs
- [ ] Test bulk import - verify no PII in logs
- [ ] Review application logs for any remaining PII
- [ ] Verify error messages still provide useful debugging info

---

## Safe Logger Usage Examples

```typescript
// ❌ UNSAFE - Logs PII
console.log('Creating competitor:', { first_name: 'John', email: 'john@example.com' });

// ✅ SAFE - No PII
logger.info('Creating competitor', { coach_id: '123', division: 'high_school' });

// ❌ UNSAFE - Full error object may contain PII
console.error('Update failed:', error);

// ✅ SAFE - Only log error message and safe context
logger.error('Competitor update failed', {
  error: error.message,
  code: error.code,
  competitor_id: id
});

// ❌ REMOVE - Debug only
console.log('About to call Supabase...');

// ✅ KEEP - Useful for debugging without PII
logger.debug('Processing request', { operation: 'create', timestamp: Date.now() });
```

---

## Files Needing Attention (Priority Order)

1. 🔴 **app/api/zoho/send/route.ts** - 30+ console calls, heavy PII exposure
2. 🔴 **app/api/competitors/create/route.ts** - DONE ✅
3. 🔴 **app/api/competitors/[id]/update/route.ts** - DONE ✅
4. 🔴 **app/api/competitors/bulk-import/route.ts** - May log imported PII
5. 🔴 **app/api/competitors/profile/[token]/update/route.ts**
6. 🟡 **app/api/zoho/upload-manual/route.ts**
7. 🟡 **app/api/zoho/webhook/route.ts**
8. 🟡 **app/api/competitors/** (remaining ~10 files)
9. 🟢 **app/api/teams/** (~15 files) - Low priority, standard errors
10. 🟢 **app/api/messaging/** (~20 files) - Low priority
11. 🟢 **app/api/admin/** (~15 files) - Low priority

---

**Total Estimated Time:** 8 hours for complete remediation
**Critical Path:** 2-3 hours for PII-related fixes
