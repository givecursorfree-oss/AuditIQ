# Drive model decision — **Shared Drive (locked)**

**Status:** Locked — Google Workspace **Shared Drives**.  
**Date:** 2026-10-15  
**Specs:** `drive-integration-security.md`, `audit-office-workflows.md`.

## Decision

Engagement working folders must live on a **Shared Drive**. My Drive shared folders are rejected at link time (`driveId` required on the folder metadata).

## Implemented

| Item | Status |
|------|--------|
| `EngagementDriveFolder` (primary + extras, stable `folderId` + `driveId`) | Done |
| `GET/POST/PATCH/DELETE /api/engagements/:id/drive-folders` | Done |
| Create folder on Shared Drive + link | Done |
| Engagement **Drive** tab: browse Shared Drives, link / create | Done |
| Drive browser defaults to Shared drives | Done |
| OAuth scope upgraded to `drive` (reconnect required) | Done |

## Deploy notes

1. `cd server && npx prisma migrate deploy && npx prisma generate`
2. Restart API
3. Managers: **Disconnect** and **reconnect** Google Drive so the new `drive` scope is granted (folder create needs write access)

## Still Phase 1 follow-ups

- Metadata-only sync (stop treating VPS download as source of truth)
- Selective file review + Windows open worker
- Intended vs effective ACL reconciliation
