# Data Processing Agreement (DPA) Tracking

**Last Updated:** 2025-10-09
**Status:** Ready to Execute

---

## Overview

This document tracks all Data Processing Agreements (DPAs) with third-party vendors that process student PII. All vendors have publicly available DPAs ready for execution.

---

## ✅ Supabase DPA (Database & Storage)

### Vendor Information
- **Vendor:** Supabase Inc.
- **Service:** PostgreSQL database + object storage
- **Website:** https://supabase.com
- **DPA Page:** https://supabase.com/legal/dpa

### DPA Availability
- **Static PDF:** https://supabase.com/downloads/docs/Supabase+DPA+250314.pdf
- **Signable Version:** Request through Supabase Dashboard
- **Status:** ✅ Publicly available, ready to sign

### How to Execute
1. Download static PDF from link above (for review)
2. Log into Supabase Dashboard
3. Navigate to legal documents section
4. Request signable PandaDoc version
5. Complete and sign electronically
6. File signed copy in `docs/audit/legal/signed-dpas/`

### Data Covered
- **Database:** All student PII in `competitors` table
  - Names, emails, demographics, grades, parent info
- **Storage:** Signed consent forms in `signatures` bucket
- **Encryption:** AES-256 at rest (infrastructure-level)
- **Location:** [Your AWS region - check dashboard]

### Sub-Processors
- **AWS:** Database (RDS) and storage (S3) infrastructure
- **Fly.io:** Edge functions (if used)

### Compliance Certifications
- ✅ SOC 2 Type II: Certified
- ✅ HIPAA: HIPAA-ready (BAA available)
- ✅ GDPR: Compliant (includes Standard Contractual Clauses)
- ✅ Swiss Data Protection Laws
- ✅ US Data Protection Laws

### Action Checklist
- [ ] Download PDF for review
- [ ] Legal team review
- [ ] Request signable version from dashboard
- [ ] Complete organization details
- [ ] Sign and execute
- [ ] File signed copy

**Priority:** 🔴 High - Required for Issue #4 completion

---

## ✅ Zoho Sign DPA

### Vendor Information
- **Vendor:** Zoho Corporation
- **Service:** Electronic signature collection
- **Website:** https://www.zoho.com/sign/
- **Compliance Page:** https://www.zoho.com/sign/compliance-with-hipaa.html

### DPA Availability
- **How to Request:** Email legal@zohocorp.com
- **Available Documents:**
  - Data Processing Addendum (GDPR)
  - Business Associate Agreement (HIPAA)
  - FERPA compliance documentation (request specifically)
- **Status:** ✅ Available on request

### How to Execute
1. Email legal@zohocorp.com with:
   ```
   Subject: DPA Request for Zoho Sign - Educational Use (FERPA)

   Hello,

   We are using Zoho Sign for collecting electronic signatures on
   student consent forms for an educational cybersecurity program.

   Please provide:
   1. Data Processing Addendum (DPA) for GDPR compliance
   2. Business Associate Agreement (BAA) for HIPAA
   3. Any FERPA-specific compliance documentation

   Our data center: [Specify your region]
   Organization: [Your organization name]

   Thank you,
   [Your name]
   ```

2. Review provided documents
3. Complete organization details
4. Sign and return
5. File signed copy

### Data Covered
- **Student PII shared with Zoho:**
  - Student/parent names
  - Student/parent emails
  - Grade level
  - School name
- **Purpose:** Electronic signature collection for:
  - Participation agreements
  - Media release forms
- **Retention:** Signed PDFs stored in Supabase (not Zoho)

### Compliance Certifications
- ✅ HIPAA: BAA available
- ✅ GDPR: DPA with Standard Contractual Clauses
- ✅ Zero-knowledge architecture
- ✅ AES-256 encryption at rest
- ✅ SSL/TLS for data in transit

### Action Checklist
- [ ] Email legal@zohocorp.com to request DPA/BAA
- [ ] Specify need for FERPA documentation
- [ ] Legal team review
- [ ] Complete and sign documents
- [ ] Return signed copies to Zoho
- [ ] File our copy

**Priority:** 🔴 High - Required for Issue #4 completion

---

## ⏳ MetaCTF DPA (or Your Game Platform)

### Vendor Information
- **Vendor:** [Your game platform vendor name]
- **Service:** Cybersecurity competition platform
- **Website:** [Platform URL]

### Data Covered
- Student names
- Student emails
- Performance/competition data
- Team assignments

### Action Required
1. Contact your game platform account manager
2. Request Data Processing Agreement
3. Inquire about FERPA compliance documentation
4. Execute agreement
5. File signed copy

### Action Checklist
- [ ] Contact platform vendor
- [ ] Request DPA
- [ ] Legal review
- [ ] Execute agreement
- [ ] File signed copy

**Priority:** 🟡 Medium - May be covered under service agreement

---

## ⏳ Monday.com DPA (if applicable)

### Vendor Information
- **Vendor:** Monday.com
- **Service:** Project management / roster tracking (if used)
- **DPA Page:** https://monday.com/legal/dpa

### Data Covered
- Coach contact information
- Potentially student roster info (if stored there)

### Action Required
1. Verify if Monday.com is actively used for student data
2. If yes: Request DPA from https://monday.com/legal/dpa
3. Execute agreement
4. File signed copy

### Action Checklist
- [ ] Verify Monday.com usage
- [ ] Determine if student data is stored
- [ ] If yes: Request DPA
- [ ] Legal review
- [ ] Execute agreement
- [ ] File signed copy

**Priority:** 🟢 Low - Only if actively using for student data

---

## DPA Execution Timeline

### Week 1 (Immediate)
- [ ] Download Supabase DPA PDF for review
- [ ] Email Zoho for DPA/BAA documents
- [ ] Contact game platform vendor

### Week 2
- [ ] Legal team reviews all DPAs
- [ ] Identify any concerns or questions
- [ ] Request clarifications from vendors if needed

### Week 3
- [ ] Execute Supabase DPA (via dashboard)
- [ ] Execute Zoho DPA (email return)
- [ ] Execute game platform DPA

### Week 4
- [ ] File all signed DPAs
- [ ] Update compliance documentation
- [ ] Mark Issue #4 as complete

---

## DPA Storage

### File Organization

```
docs/audit/legal/
├── dpa-tracking.md (this file)
└── signed-dpas/
    ├── supabase-dpa-signed-YYYY-MM-DD.pdf
    ├── zoho-dpa-signed-YYYY-MM-DD.pdf
    ├── zoho-baa-signed-YYYY-MM-DD.pdf
    ├── metactf-dpa-signed-YYYY-MM-DD.pdf
    └── README.md (inventory)
```

### Create Signed DPAs Folder

```bash
mkdir -p docs/audit/legal/signed-dpas
```

### Create Inventory File

When you file signed DPAs, create `signed-dpas/README.md`:

```markdown
# Signed Data Processing Agreements

## Inventory

### Supabase
- File: supabase-dpa-signed-2025-10-XX.pdf
- Signed: [Date]
- Signatory: [Name, Title]
- Effective: [Date]
- Review: Annual

### Zoho Sign
- DPA File: zoho-dpa-signed-2025-10-XX.pdf
- BAA File: zoho-baa-signed-2025-10-XX.pdf
- Signed: [Date]
- Signatory: [Name, Title]
- Effective: [Date]
- Review: Annual

### [Game Platform]
- File: metactf-dpa-signed-2025-10-XX.pdf
- Signed: [Date]
- Signatory: [Name, Title]
- Effective: [Date]
- Review: Annual
```

---

## Annual Review Checklist

**Next Review Due:** 2026-10-09

### Review Process
- [ ] Verify all DPAs still current and valid
- [ ] Check for any changes to vendor terms
- [ ] Review sub-processors list
- [ ] Confirm compliance certifications still valid
- [ ] Update contact information if changed
- [ ] Renew or update expiring agreements
- [ ] Document review in this file

### When to Update DPAs
- Annually (scheduled review)
- When adding new vendor
- When vendor changes sub-processors
- When vendor changes data location
- When vendor changes compliance status
- When our data processing changes

---

## Compliance Impact

### Current Status (Before DPAs)
**FERPA Compliance Score:** 81/100

**Area 5: Third-Party Integrations:** 5/10

### After Executing DPAs
**Projected Score:** 86-88/100

**Area 5: Third-Party Integrations:** 10/10 ✅

**Improvement:** +5 to +7 points

---

## Quick Reference

### Need to Execute DPA?

**Supabase:**
- Visit: https://supabase.com/legal/dpa
- Download PDF or request signable version

**Zoho:**
- Email: legal@zohocorp.com
- Request DPA + BAA + FERPA docs

**Game Platform:**
- Contact: Your account manager
- Request: DPA and FERPA compliance docs

**Questions?**
- Review this document
- Contact vendor support
- Consult with legal team

---

## Document History

- **2025-10-09:** Initial creation with vendor DPA links
- **Future:** Update with execution dates and signed document references

---

**Maintained by:** [Your team]
**Contact for questions:** [Your email]
