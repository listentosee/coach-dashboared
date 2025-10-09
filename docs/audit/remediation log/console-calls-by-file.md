# Console Logging Calls by File - Review List

## app/api/zoho/send/route.ts (33 calls)

### Remove - Debug Only (❌)
```
Line 14: console.log('Zoho send API called with:', { competitorId: req.body });
Line 17: console.log('Parsed request:', { competitorId, mode });
Line 20: console.log('Supabase client created');
Line 95: console.log('Getting Zoho access token...');
Line 97: console.log('Access token retrieved:', accessToken ? 'Success' : 'Failed');
Line 128: console.log('Fetching template details from Zoho...');
Line 132: console.log('Template fetch response:', { status: tRes.status, ok: tRes.ok });
Line 141: console.log('Template data received:', { hasTemplates: !!tJson.templates, actionsCount: tJson.templates?.actions?.length });
Line 149: console.log('Action found:', { actionId: action.action_id, actionType: action.action_type });
Line 213: console.log('Print mode detected - creating Zoho request for PDF generation');
Line 256: console.log('Print Zoho request ID:', printRequestId);
Line 274: console.log('Print agreement record created successfully:', agreementData);
Line 301: console.log('Pre-filled PDF generated and stored:', pdfPath);
Line 329: console.log('Creating document in Zoho...');
Line 339: console.log('Document creation response:', { status: createRes.status, ok: createRes.ok });
Line 342: console.log('Document creation result:', createJson);
Line 350: console.log('Zoho request ID:', requestId);
Line 353: console.log('Creating agreement record in database...');
Line 369: console.log('Agreement record created successfully:', agreementData);
```

### Critical PII - Must Fix (🔴)
```
Line 51: console.log('Raw competitor data from Supabase:', c);
         // Logs FULL competitor object with first_name, last_name, emails

Line 65: console.log('Competitor data fetched:', {
           id: c.id,
           name: `${c.first_name} ${c.last_name}`,
           isAdult: c.is_18_or_over,
           email: c.is_18_or_over ? c.email_school : c.parent_email
         });
         // Logs name and email directly

Line 204: console.log('Field data being sent:', field_data);
          // Logs participant_name, school, grade
```

### Replace with Safe Logger (✏️)
```
Line 54: console.error('Competitor fetch error:', error);
         → logger.error('Competitor fetch failed', { error: error.message, competitorId });

Line 93: console.log('Template selection:', { isAdult, templateId, templateKind });
         → logger.info('Template selected', { templateKind });

Line 136: console.error('Template fetch failed:', { status: tRes.status, error: errorText });
          → logger.error('Template fetch failed', { status: tRes.status, templateId });

Line 145: console.error('No actions found in template');
          → logger.error('No actions in template', { templateId });

Line 250: console.error('Print request creation failed:', { status: printCreateRes.status, error: errorText });
          → logger.error('Print request failed', { status: printCreateRes.status });

Line 270: console.error('Failed to create print agreement record:', agreementError);
          → logger.error('Agreement creation failed', { error: agreementError.message });

Line 303: console.warn('Failed to store pre-filled PDF:', storageError);
          → logger.warn('PDF storage failed', { error: storageError.message });

Line 306: console.warn('Failed to generate pre-filled PDF:', pdfResponse.status);
          → logger.warn('PDF generation failed', { status: pdfResponse.status });

Line 309: console.warn('PDF generation failed:', pdfError);
          → logger.warn('PDF generation error', { error: pdfError.message });

Line 345: console.error('Document creation failed:', { status: createRes.status, response: createJson });
          → logger.error('Document creation failed', { status: createRes.status });

Line 365: console.error('Failed to create agreement record:', agreementError);
          → logger.error('Agreement record creation failed', { error: agreementError.message });
```

---

## app/api/zoho/upload-manual/route.ts

```
Line 68: console.error('Storage upload failed:', uploadError);
         → logger.error('Storage upload failed', { error: uploadError.message });

Line 92: console.log('Zoho request recalled successfully');
         ❌ REMOVE

Line 95: console.warn('Failed to recall Zoho request:', recallResponse.status, errorText);
         → logger.warn('Zoho recall failed', { status: recallResponse.status });

Line 114: console.log('Zoho request deleted successfully');
          ❌ REMOVE

Line 117: console.warn('Failed to delete Zoho request:', deleteResponse.status, errorText);
          → logger.warn('Zoho deletion failed', { status: deleteResponse.status });

Line 122: console.warn('Zoho API operations failed:', zohoError);
          → logger.warn('Zoho API error', { error: zohoError.message });

Line 150: console.error('Agreement update failed:', updateError);
          → logger.error('Agreement update failed', { error: updateError.message });

Line 162: console.error('Competitor update failed:', competitorError);
          → logger.error('Competitor update failed', { error: competitorError.message });

Line 191: console.error('Manual upload failed:', error);
          → logger.error('Manual upload failed', { error: error.message });
```

---

## app/api/zoho/webhook/route.ts

```
Line 117: console.error('PDF store failed', e);
          → logger.error('PDF storage failed', { error: e.message });
```

---

## app/api/zoho/download/route.ts

```
Line 22: console.error('Storage download failed:', error);
         → logger.error('Storage download failed', { error: error.message });

Line 38: console.error('Download failed:', error);
         → logger.error('Download failed', { error: error.message });
```

---

## app/api/competitors/bulk-import/route.ts

```
Line 170: console.error('Bulk import error', e);
          → logger.error('Bulk import failed', { error: e.message });
```

---

## app/api/competitors/check-duplicates/route.ts

```
Line 35: console.error('Database error:', error);
         → logger.error('Duplicate check failed', { error: error.message });

Line 65: console.error('Error checking duplicates:', error);
         → logger.error('Duplicate check error', { error: error.message });
```

---

## app/api/competitors/route.ts

```
Line 65: console.error('Database error:', competitorsError);
         → logger.error('Competitors fetch failed', { error: competitorsError.message });

Line 162: console.error('Error fetching competitors:', error);
          → logger.error('Competitors fetch error', { error: error.message });
```

---

## app/api/competitors/paged/route.ts

```
Line 75: console.error('Admin paged competitors error', e);
         → logger.error('Paged competitors error', { error: e.message });
```

---

## app/api/competitors/[id]/regenerate-link/route.ts

```
Line 47: console.error('Error generating token:', tokenError);
         → logger.error('Token generation failed', { error: tokenError.message });

Line 66: console.error('Database error:', updateError);
         → logger.error('Token update failed', { error: updateError.message });

Line 99: console.error('Error regenerating profile link:', error);
         → logger.error('Link regeneration failed', { error: error.message });
```

---

## app/api/competitors/[id]/toggle-active/route.ts

```
Line 63: console.error('Database error:', error);
         → logger.error('Status toggle failed', { error: error.message });

Line 77: console.error('Error updating competitor status:', error);
         → logger.error('Status update error', { error: error.message });
```

---

## app/api/competitors/profile/[token]/route.ts

```
Line 37: console.error('Error fetching competitor profile:', error);
         → logger.error('Profile fetch failed', { error: error.message });
```

---

## app/api/competitors/profile/[token]/update/route.ts

```
Line 73: console.error('Database error:', updateError);
         → logger.error('Profile update failed', { error: updateError.message, token });

Line 85: console.error('Status update error:', statusError);
         → logger.error('Status update failed', { error: statusError.message });

Line 99: console.error('Error updating competitor profile:', error);
         → logger.error('Profile update error', { error: error.message });
```

---

## app/api/competitors/profile/[token]/send-participation/route.ts

```
Line 123: console.error('send-participation error', e);
          → logger.error('Send participation failed', { error: e.message });
```

---

## app/api/competitors/maintenance/update-statuses/route.ts

```
Line 33: console.error('Bulk status update errors:', result.errorDetails);
         → logger.error('Bulk status errors', { errorCount: result.errors });

Line 58: console.error('Error updating competitor statuses:', error);
         → logger.error('Status update failed', { error: error.message });
```

---

## Summary for Quick Review

### CRITICAL - Must Remove (Logs PII):
- `app/api/zoho/send/route.ts` Line 51: Raw competitor data
- `app/api/zoho/send/route.ts` Line 65: Competitor name + email
- `app/api/zoho/send/route.ts` Line 204: Field data with participant name

### Remove - Debug Only (19 calls in zoho/send/route.ts):
Lines: 14, 17, 20, 95, 97, 128, 132, 141, 149, 213, 256, 274, 301, 329, 339, 342, 350, 353, 369

### Replace - Standard Error Logging (~50 calls):
All `console.error/warn()` calls should use `logger.error/warn()` with sanitized context

---

## Next Steps

1. Review this list
2. Identify any that should be kept as-is
3. I'll implement the changes based on your decisions
