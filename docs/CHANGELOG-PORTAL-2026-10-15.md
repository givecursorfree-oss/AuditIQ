# Portal update pack — 15 Oct 2026

Single list of everything shipped on `main` for this round (API on VPS + UI on Vercel). Tip commit: `8782384`.

## A. Leave & HR

1. **Leave mail (AM / Sr AE / Staff)** → only `arunmehta@mkdandeker.com` and `poosaidurai@mkdandeker.com`.
2. **Sanction / Reject** hidden after leave is no longer Pending (no actions on Manager Approved / Approved).
3. **Leave inbox status filter**: Pending | Manager approved | Approved | Rejected | All.
4. Leave duplicate-submit hardened (DB lock + overlap checks).
5. Password **eye** on Add employee; **Partner** visible in Role for HR.

## B. Timesheet / attendance / engagements (ops)

6. Timesheet + Attendance **client = select only** (no free typing).
7. HR timesheet Excel = firm **7-slot** workbook layout.
8. New Engagement **client dropdown** loads full list (`limit=2000`).
9. Engagement import: managers can import clients they manage (assigned-clients gate loosened when managerId set).

## C. GST notices

10. Excel import for GST notices + Notices dashboard / hosted edits.

## D. Google Drive — Shared Drive (locked)

11. Product model **Shared Drive only** (My Drive folders rejected on link).
12. `EngagementDriveFolder`: primary + extra folder links per engagement.
13. API: `GET/POST/PATCH/DELETE /api/engagements/:id/drive-folders` (+ `/create`).
14. Engagement default tab **Drive**: browse Shared Drives, link / create / unlink / Open in Drive.
15. Drive workspace nav; Client Requests + Approvals **sidebar-hidden** (routes kept).
16. Letter tab marked deferred; team assign not blocked by letter.
17. OAuth scope → `https://www.googleapis.com/auth/drive` (**reconnect Google** after deploy).
18. Migration: `20261015150000_engagement_drive_folders`.

## Deploy checklist

| Layer | Action |
|-------|--------|
| GitHub | `main` @ `8782384` |
| VPS API | Manual **Actions → Deploy** (or this agent’s `gh workflow run Deploy`) → pull + compose + `prisma migrate deploy` |
| Vercel UI | Redeploy / auto-deploy from `main` |
| After API up | Manager: Disconnect + Connect Google Drive again |

## How to test Drive path

1. Open existing engagement → **Drive** tab.  
2. Connect Google if needed (new scope).  
3. Open a Shared Drive → **Link primary** or **Create & link**.  
4. Confirm **Open in Drive** opens the same folder.
