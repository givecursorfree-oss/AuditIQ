# Document search (File Brain–style)

AuditIQ implements the same **core search stack** as [File Brain](https://github.com/Hamza5/file-brain):

| Layer | Technology | Role |
|-------|------------|------|
| Text extraction | Apache Tika | PDF, Word, Excel, images → plain text |
| Search index | Typesense 29 | Fast full-text + vector (semantic) search |
| Embeddings | `ts/paraphrase-multilingual-mpnet-base-v2` | ONNX model (built into Typesense, same family as File Brain) |
| Metadata | MySQL | Permissions, engagement access, fallback search |

**Not included (File Brain PRO):** chat-with-files, video scene search, cloud folder UI.

## How it works

### 1. Upload or sync

When a file is uploaded (or synced from Google Drive):

1. File is stored on disk (`uploads/`).
2. A row is created in MySQL with `indexStatus: PENDING`.
3. Background job **`indexDocument`** runs:
   - **Tika** extracts text from the file (or `pdf-parse` / plain-text fallback if Tika is down).
   - Text is saved in MySQL `ocrText` (fallback search).
   - Document JSON is sent to **Typesense** (name, folder, category, full `content`).
4. Typesense **auto-embeds** `original_name`, `content`, `folder`, `category` into an `embedding` vector using the ONNX model.
5. Status becomes `INDEXED`.

### 2. Search query

When you type in Documents or the header search box:

1. API checks your **firm** and **engagement membership** (security).
2. If Typesense is up and semantic search is enabled:
   - **Hybrid search** runs:
     - **Keyword leg:** typo-tolerant match on filename and content.
     - **Semantic leg:** your query is embedded with the same model; nearest vectors = “meaning” matches (e.g. “invoice flight” finds “air ticket receipt”).
   - Results are merged with rank fusion (`alpha` ≈ 0.45 semantic / 0.55 keyword by default).
3. If Typesense is down: MySQL searches `originalName` and `ocrText`.
4. Full document cards are returned to the UI with optional content **highlights**.

### 3. Why “meaning” search works

The model maps sentences to vectors in a shared space. Similar meanings → close vectors, even with different words or languages (multilingual model). That is the same idea as File Brain’s semantic search, without shipping a separate Python desktop app.

## Local setup

```bash
# 1. Start Typesense + Tika (Docker Desktop running; uses docker-compose.search.yml — no root .env needed)
npm run search:up

# 2. Restart API (first start downloads the ONNX model — can take 1–3 minutes)
npm run dev

# 3. Re-index existing files (Admin/Partner), or wait for startup queue
curl -X POST http://localhost:3001/api/search/reindex -H "Cookie: auditiq_token=..." 
```

Check status: `GET /api/config` → `documentSearch.mode` should be `"hybrid"`.

## Environment

| Variable | Default | Purpose |
|----------|---------|---------|
| `SEMANTIC_SEARCH_ENABLED` | `true` | Turn off to use keyword-only Typesense |
| `TYPESENSE_EMBEDDING_MODEL` | `ts/paraphrase-multilingual-mpnet-base-v2` | Typesense built-in ONNX model |
| `SEMANTIC_SEARCH_ALPHA` | `0.45` | Hybrid weight for vector vs keyword (0–1) |
| `TYPESENSE_HOST` | `http://localhost:8108` | Typesense URL |
| `TIKA_URL` | `http://localhost:9998` | Tika URL |

## Google Drive sync

AuditIQ syncs selected Google Drive folders into the Document Library and indexes them with the same Tika + Typesense pipeline as manual uploads.

### Setup (server admin)

1. Create a project in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **Google Drive API**.
3. Create **OAuth 2.0 Client ID** (Web application).
4. Add authorized redirect URI: `http://localhost:3001/api/integrations/google-drive/callback` (or your production API URL).
5. Set in `server/.env`:

```env
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-secret
GOOGLE_REDIRECT_URI=http://localhost:3001/api/integrations/google-drive/callback
```

### Usage (Partner / Admin / Manager)

1. Open **Documents → Google Drive**.
2. **Connect** with your Google account (read-only scope).
3. Browse folders in the picker and select folders to sync.
4. Choose a **default engagement** for imported files.
5. Click **Save settings**, then **Sync now**.

The scheduler also syncs all active connections on the interval set by `SCHEDULER_INTERVAL_MIN` (default 60 minutes).

### Sync behaviour

| Step | Action |
|------|--------|
| New/changed file | Downloaded to `uploads/`, `indexStatus: PENDING`, queued for Tika + Typesense |
| Unchanged file | Skipped (compares Drive `modifiedTime`) |
| Removed from Drive | Deleted locally and removed from search index |
| Concurrent sync | Rejected with HTTP 409 |

OAuth state is **HMAC-signed** (survives server restarts; no in-memory session store).

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `documentSearch.mode: mysql` | Run `npm run search:up`, restart server |
| No content matches, only filenames | Tika unreachable — start Tika container |
| Search empty after upgrade | `POST /api/search/reindex` or restart server (auto-migrates collections) |
| First search very slow | Normal while Typesense downloads the embedding model |
