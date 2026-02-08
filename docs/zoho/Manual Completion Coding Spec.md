# Manual Completion (Upload + Recall/Delete in Zoho + Local Manual Flag)

## Overview

This spec outlines a **manual completion workflow** for agreements when a finalized, hand‑signed PDF is uploaded. Instead of relying on Zoho’s signer flow, we will:

1. Store the uploaded PDF in an **encrypted private Supabase Storage** bucket
    
2. Call Zoho Sign’s API to **recall** the request (reason: "Manual completion")
    
3. **Delete** the Zoho request to clean up
    
4. Mark the local agreement as **manually completed**, not as Zoho-completed
    

---

## Zoho API Endpoints

- **Recall document**:  
    `POST https://sign.zoho.com/api/v1/requests/{request_id}/recall`  
    Cancels the signing process; recipients can no longer view or sign the document.
    
- **Delete document**:  
    `PUT https://sign.zoho.com/api/v1/requests/{request_id}/delete`  
    Moves the document to trash. Supports parameters: `recall_inprogress=true`, `reason="...".`
    

---

## Data Model Additions

Extend the `agreements` table with:

- `completion_source` (enum): `'zoho' | 'manual'`
    
- `manual_completion_reason` (string, default `"Manual completion"`)
    
- `manual_uploaded_path` (string)
    
- `manual_completed_at` (timestamp)
    
- `zoho_request_status` (string; optional mirroring of Zoho status)
    

Update `status` to `'completed_manual'` to distinguish from Zoho-completed records.

---

## Flow Overview

1. **Accept upload** via existing route (`file`, `agreementId`)
    
2. **Upload file** to Supabase Storage, in `manual/` folder, private bucket
    
3. **Check Zoho status** (optional): abort if already completed
    
4. **Recall Zoho request** with `"Manual completion"` as reason
    
5. **Delete Zoho request** with `recall_inprogress=true`, same reason
    
6. **Update local DB**:
    
    ```ts
    status = 'completed_manual'
    completion_source = 'manual'
    manual_completed_at = now
    manual_uploaded_path = <storage_path>
    manual_completion_reason = 'Manual completion'
    updated_at = now
    ```
    
7. **Recompute competitor status** (existing logic)
    

---

## Route Pseudocode

```ts
// Assume request_id, file, agreementId are available

// Step 0: Clean up previous upload files if they exist
// (prevents orphaned files when re-uploading for the same agreement)
const pathsToRemove = [agreement.manual_uploaded_path, agreement.signed_pdf_path].filter(Boolean);
if (pathsToRemove.length) await supabase.storage.from('signatures').remove(pathsToRemove);

// Step 1: Upload to Supabase
const fileBuffer = Buffer.from(await file.arrayBuffer());
const path = `manual/manual-upload-${request_id}-${Date.now()}.${ext}`;
await supabase.storage
  .from('signatures')
  .upload(path, fileBuffer, { contentType: file.type || 'application/pdf', upsert: false });

// Step 2 (opt): GET /requests/{request_id} to verify status

// Step 3: Recall
await fetch(`${ZOHO_ROOT}/api/v1/requests/${request_id}/recall`, {
  method: 'POST',
  headers: { Authorization: `Zoho-oauthtoken ${token}` },
  body: JSON.stringify({ reason: 'Manual completion' })
});

// Step 4: Delete
await fetch(`${ZOHO_ROOT}/api/v1/requests/${request_id}/delete`, {
  method: 'PUT',
  headers: { Authorization: `Zoho-oauthtoken ${token}` },
  body: JSON.stringify({ recall_inprogress: true, reason: 'Manual completion' })
});

// Step 5: Update DB
await supabase.from('agreements').update({
  status: 'completed_manual',
  completion_source: 'manual',
  manual_completion_reason: 'Manual completion',
  manual_uploaded_path: path,
  manual_completed_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}).eq('id', agreementId);

// Step 6: Recompute competitor status
```

---

## Security & Defensibility

- **Private bucket**—set Supabase RLS policies; only server-side access (no client exposure)
    
- **Encryption**—Supabase encrypts in transit and at rest. For stricter control, consider optional app-layer encryption.
    
- **File validation**—restrict uploads to PDFs only, with size limits. Optionally scan for malware.
    
- **Immutability**—set `upsert: false` for storage; generate unique filenames; log everything (audit table)
    
- **Idempotency**—calculate checksum; on retries detect duplicates and skip both upload and recall/delete
    
- **Error handling**:
    
    - If recall fails → abort and expose retry path
        
    - If recall succeeds but delete fails → mark local status, flag `zoho_cleanup_pending`
        
- **Audit logs**—capture API responses, timestamps, reasons, etc.

- **Storage cleanup**—both the manual upload route and the cancel route clean up any previously stored files (`signed_pdf_path`, `manual_uploaded_path`) before uploading new files or deleting the agreement record. This prevents orphaned files in the `signatures` bucket.
    

---

## Testing Checklist

-  Upload lands in Supabase, not publicly accessible
    
-  Zoho recall succeeds (recipients blocked)
    
-  Zoho delete succeeds (moved to trash)
    
-  Local DB reflects manual completion correctly (status, source, timestamps)
    
-  Automations based on Zoho-completion do not trigger
    
-  Handle both duplicate uploads and partial failures gracefully
    

---

## Future Enhancements

- **Admin retry UI** for recall/delete failures
    
- **Webhook integration** to handle Zoho state changes for audit
    
- **Signed URL downloads** with short TTLs for file access
    
- **UI indicators**: label records “Completed (Manual Upload)” to avoid confusion
    

---

## References

- Zoho **Recall document** (cancel signing flow)
    
- Zoho **Delete document** (trash request)
    
- Zoho **Document management operations summary**
    
- Supabase **Storage RLS and encryption**