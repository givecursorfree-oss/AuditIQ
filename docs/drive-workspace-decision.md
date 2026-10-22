# Drive model decision — Shared Drive **or** Shared Folder

**Status:** Active — either Google Workspace **Shared Drive** or **Shared Folder**.  
**Date:** 2026-10-22 (supersedes 2026-10-15 Shared-Drive-only lock)  
**Specs:** `drive-integration-security.md`, `audit-office-workflows.md`.

## Decision

Each engagement links to opaque Drive storage via `EngagementDriveFolder`:

| `linkKind` | Meaning | `driveId` |
|------------|---------|-----------|
| `SHARED_DRIVE` | Folder (or drive root) on a Shared Drive | Set |
| `SHARED_FOLDER` | Shared / My Drive folder (not on a Shared Drive) | `null` |

Engagement structure in AuditIQ stays **independent** of Google Drive folder layout. Client-wise, service-wise, engagement-wise, or mixed Drive trees can be reorganised later without changing engagement IDs, documents, or search — switch storage by unlink + re-link (no automated folder migration).

## Product rules (current)

- **Existing engagements:** manually select and connect an existing Shared Drive or Shared Folder (paste URL/id or browse).
- **New engagements:** after create, Drive tab offers create-new-folder **or** select existing (either kind).
- **No** automated folder organisation or restructuring.

## Implemented

| Item | Status |
|------|--------|
| `EngagementDriveFolder.linkKind` + nullable `driveId` | Done |
| Link existing Shared Drive or Shared Folder | Done |
| Create folder under Shared Drive or Shared Folder + link | Done |
| Engagement **Drive** tab: scope toggle Shared Drive / Shared folder | Done |
| New engagement → opens Drive tab to connect storage | Done |
| OAuth scope `drive` (reconnect if needed) | Done |

## Deploy notes

1. `cd server && npx prisma migrate deploy && npx prisma generate`
2. Restart API
3. Managers: **Disconnect** and **reconnect** Google Drive if write scope was never granted

## Still Phase 1 follow-ups

- Metadata-only sync (stop treating VPS download as source of truth)
- Selective file review + Windows open worker *(partial: Workspace files panel — mark + send-review syncs into Client docs + notifies manager/partner)*
- Intended vs effective ACL reconciliation
- Optional: automated folder templates per organisation scheme (out of scope for now)
