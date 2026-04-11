# Graph Report - graphify-out  (2026-04-11)

## Corpus Check
- Large corpus: 48 files · ~598,957 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 169 nodes · 194 edges · 23 communities detected
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `fetchSessions()` - 4 edges
2. `fetchAll()` - 3 edges
3. `createSession()` - 3 edges
4. `handleCheckIn()` - 2 edges
5. `handleCheckOut()` - 2 edges
6. `openSession()` - 2 edges
7. `deleteSession()` - 2 edges
8. `sendMessage()` - 2 edges
9. `fetch()` - 2 edges
10. `handleDelete()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `AuditIQ India` ----> `Document & Evidence Management`  [EXTRACTED]
   →   _Bridges community 0 → community 5_
- `Dashboard Design System Skill` ----> `AuditIQ India`  [EXTRACTED]
   →   _Bridges community 0 → community 4_

## Communities

### Community 0 - "AuditIQ India"
Cohesion: 0.06
Nodes (37): Gemini-Generated Brand Image (original), Gemini-Generated Brand Image (no background), AuditIQ Logo (with background), AuditIQ Logo (transparent), AuditIQ Copilot, Intelligent Document Processing, Regulatory Fetch & Intelligence, Risk & Anomaly Intelligence (+29 more)

### Community 1 - "AuthContext.tsx"
Cohesion: 0.09
Nodes (2): fetch(), handleStatusChange()

### Community 2 - "AuditIQ.jsx"
Cohesion: 0.11
Nodes (0): 

### Community 3 - "code-review-graph MCP"
Cohesion: 0.15
Nodes (15): code-review-graph MCP, detect_changes, get_affected_flows, get_architecture_overview, get_impact_radius, get_review_context, list_communities, query_graph (+7 more)

### Community 4 - "Dashboard Design System Skill"
Cohesion: 0.13
Nodes (15): AuditIQ Favicon (SVG), WCAG 2.2 AA Accessibility, Color Palette Tokens, Primary Color #0C5CAB, Auth & Settings Screens, Button Components, Data Display Components, Feedback & State Components (+7 more)

### Community 5 - "RBAC"
Cohesion: 0.25
Nodes (9): Document & Evidence Management, Review & Approval Workflow, Audit Workpapers & Fieldwork, Audit Client (Role), Manager (Role), Partner (Role), Staff (Role), Two-Factor Authentication (2FA) (+1 more)

### Community 6 - "Copilot.tsx"
Cohesion: 0.48
Nodes (5): createSession(), deleteSession(), fetchSessions(), openSession(), sendMessage()

### Community 7 - "Settings.tsx"
Cohesion: 0.29
Nodes (0): 

### Community 8 - "Attendance.tsx"
Cohesion: 0.47
Nodes (3): fetchAll(), handleCheckIn(), handleCheckOut()

### Community 9 - "Documents.tsx"
Cohesion: 0.5
Nodes (2): fetch(), handleDelete()

### Community 10 - "auth.ts"
Cohesion: 0.5
Nodes (0): 

### Community 11 - "seed.ts"
Cohesion: 1.0
Nodes (0): 

### Community 12 - "extract_prd.py"
Cohesion: 1.0
Nodes (0): 

### Community 13 - "postcss.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 14 - "tailwind.config.js"
Cohesion: 1.0
Nodes (0): 

### Community 15 - "vite.config.ts"
Cohesion: 1.0
Nodes (0): 

### Community 16 - "index.ts"
Cohesion: 1.0
Nodes (0): 

### Community 17 - "admin.ts"
Cohesion: 1.0
Nodes (0): 

### Community 18 - "clients.ts"
Cohesion: 1.0
Nodes (0): 

### Community 19 - "notifications.ts"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "IT/Admin (Role)"
Cohesion: 1.0
Nodes (1): IT/Admin (Role)

### Community 21 - "AI Governance & Ethics"
Cohesion: 1.0
Nodes (1): AI Governance & Ethics

### Community 22 - "SOC 2 Type I"
Cohesion: 1.0
Nodes (1): SOC 2 Type I

## Knowledge Gaps
- **Thin community `seed.ts`** (2 nodes): `seed.ts`, `main()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `extract_prd.py`** (1 nodes): `extract_prd.py`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `postcss.config.js`** (1 nodes): `postcss.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `tailwind.config.js`** (1 nodes): `tailwind.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `vite.config.ts`** (1 nodes): `vite.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `index.ts`** (1 nodes): `index.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `admin.ts`** (1 nodes): `admin.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `clients.ts`** (1 nodes): `clients.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `notifications.ts`** (1 nodes): `notifications.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `IT/Admin (Role)`** (1 nodes): `IT/Admin (Role)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `AI Governance & Ethics`** (1 nodes): `AI Governance & Ethics`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `SOC 2 Type I`** (1 nodes): `SOC 2 Type I`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Should `AuditIQ India` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `AuthContext.tsx` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `AuditIQ.jsx` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Dashboard Design System Skill` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._