# Local development — XAMPP MySQL + Docker search only

## Yes — your database is MySQL

AuditIQ stores **everything** in **MySQL**:

- Users, login, roles  
- Clients, engagements, workpapers  
- Document **metadata** (filename, path, who uploaded, etc.)  
- Attendance, billing, audit log, and the rest  

The app talks to MySQL through **Prisma** using this line in `server/.env`:

```env
DATABASE_URL="mysql://root@127.0.0.1:3306/auditiq"
```

That means: MySQL on your PC, port **3306**, database name **auditiq**, user **root** (no password — typical XAMPP default).

---

## What is XAMPP?

**XAMPP** is a local dev bundle for Windows:

| Letter | Meaning |
|--------|---------|
| **X** | Cross-platform |
| **A** | **Apache** (web server — not required for AuditIQ dev) |
| **M** | **MySQL** (your database) |
| **P** | **PHP** (not required for AuditIQ) |

For AuditIQ you only need **MySQL** from XAMPP. Start it in **XAMPP Control Panel → MySQL → Start**.

You do **not** need Docker for the database if XAMPP MySQL is running.

---

## What uses Docker?

Docker is only for **document search** (optional but recommended):

| Service | Role | Docker? |
|---------|------|--------|
| **MySQL** | All app data | **XAMPP** (recommended on your PC) |
| **Typesense** | Fast + semantic search index | Docker (`npm run search:up`) |
| **Apache Tika** | Extract text from PDF/Word | Docker (`npm run search:up`) |
| **Node API** | Backend | `npm run dev` (not Docker) |
| **Vite UI** | Frontend | `npm run dev` (not Docker) |

On a **VPS**, you can run MySQL + Typesense + Tika + API all in Docker (`docker compose up`). On your **Windows PC**, using XAMPP for MySQL is fine and normal.

---

## Recommended daily workflow (your setup)

### 1. Start XAMPP MySQL

- Open **XAMPP Control Panel**
- Click **Start** next to **MySQL** (green = running)

Do **not** run `npm run db:up` at the same time — both use port 3306 and will conflict.

If you previously ran `npm run db:up`, stop Docker MySQL:

```powershell
npm run db:down
```

### 2. Create database (once)

In phpMyAdmin (`http://localhost/phpmyadmin`) or MySQL shell:

```sql
CREATE DATABASE IF NOT EXISTS auditiq;
```

### 3. Sync schema + users (once, or after schema changes)

```powershell
cd "C:\Users\msara\OneDrive\Desktop\Audit Project"
npm run db:push
# If the API is already running and Prisma reports EPERM on generate:
npm run db:push:safe
npm run db:reset
```

For production or shared databases, prefer `npm run db:migrate` (see `server/prisma/migrations/README.md`).

`db:reset` creates test logins (password **Admin@123** for all):

| Role | Email |
|------|--------|
| Admin | admin@mkd.co |
| Partner | partner@mkd.co |
| Manager | manager@mkd.co |
| Executive | executive@mkd.co |
| HR | hr@mkd.co |
| Accounts | accounts@mkd.co |
| Client | client@mkd.co |

### 4. Start search (Docker — Typesense + Tika only)

```powershell
npm run search:up
```

### 5. Start the app

```powershell
npm run dev
```

Open http://localhost:5173 → login **partner@mkd.co** / **Admin@123** (or **client@mkd.co** for portal)

---

## Where data is written

| What | Where |
|------|--------|
| Users, engagements, clients, etc. | **XAMPP MySQL** → database `auditiq` |
| Uploaded files (PDFs, etc.) | `server/uploads/` on disk |
| Search index (vectors + text) | **Typesense** (Docker volume) |
| Extracted document text | MySQL column `Document.ocrText` + Typesense |

Prisma **writes** to MySQL for every create/update (login, upload, engagement, etc.). No second database — one MySQL only.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Login fails / database error | Start **XAMPP MySQL**; run `npm run db:down` if Docker MySQL was started |
| Port 3306 in use | Only one MySQL: XAMPP **or** Docker, not both |
| Search not semantic | `npm run search:up`, restart `npm run dev` |
| Empty database after Docker MySQL | You switched DB servers — seed XAMPP again: `npm run db:reset` |

---

## VPS (later)

Production uses the same **MySQL** database type. On the server you can use:

- MySQL in Docker (full `docker compose up`), or  
- MySQL installed on the host  

`DATABASE_URL` in production `.env` points to that server’s MySQL — same idea as XAMPP locally.
