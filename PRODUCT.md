# Product

## Register

product

## Users
Primary users are internal CA firm teams (Partner, Manager, Staff, Intern) working in day-to-day audit workflows, plus clients using portal surfaces for submissions, queries, and status tracking. Internal users need speed, clarity, and trust in dense operational screens. Clients need clear guidance and confidence when uploading documents and reviewing updates.

## Product Purpose
Audit Project is an operational audit platform for CA firms, covering engagement workflow, document collection, collaboration, tracking, and client communication in one connected system. It exists to reduce friction across internal execution and client handoffs. Success means faster task completion, fewer submission gaps, and a consistent professional experience across all modules.

## Service catalog (long-term)
The **Service Catalog** (`/services`) is the firm’s single source of truth for DT, IDT, and Audit offerings. Each service defines: legal basis, what the firm will ask the client, document requirements, where items appear in the app (data checklist, client portal, workflow board, etc.), and checklist items auto-created when an engagement is opened. Profiles live in `server/src/lib/serviceRequirements.ts` and are exposed via `GET /api/workflow/catalog` and `GET /api/workflow/services/:code`.

## Brand Personality
Professional, calm, minimal.  
Tone is clear and direct, with low visual noise and high readability. The interface should feel dependable and task-focused rather than decorative.

## Anti-references
- Heavy gradients, glassmorphism, glow-heavy surfaces
- Over-rounded cards and controls that feel playful or inflated
- Generic SaaS hero-metrics styling in operational views
- Excess decorative motion that does not communicate state

## Design Principles
1. Task-first clarity over decoration: every visual decision must improve comprehension or flow.
2. Earned familiarity: use standard, trustworthy product affordances unless there is a clear UX win.
3. Consistency across modules: shared component vocabulary, spacing rhythm, and interaction behavior.
4. Progressive disclosure: keep dense workflows scannable while making deeper details available on demand.
5. Calm confidence: restrained color and motion, strong typography, explicit state feedback.

## Accessibility & Inclusion
Target WCAG AA for all core product surfaces. Ensure keyboard operability, visible focus states, semantic structure, and contrast-compliant text and controls. Support reduced-motion preferences and avoid relying on color alone to convey state.

## MKD — Role navigation matrix (MKD spec)

Sidebar items are defined in `client/src/lib/navCatalog.ts`. **Settings → Roles & Permissions** controls which modules each role can access; changes apply in real time (sidebar refetches permissions).

| Sidebar item | Permission module | Default roles |
|---|---|---|
| Dashboard | `dashboard:view` | All staff + Client |
| Workflow / Engagements | `engagements:view` | Partner, Admin, Manager, Staff, Intern |
| Workflow Board / Service Catalog / Employees | `engagements:view` or `employees:view` | Partner–Staff (hidden for Intern unless granted) |
| Clients | `clients:view` | Partner–Intern |
| Workpapers / Documents / Approvals | module `:view` | Per role seed |
| Time & Billing / Attendance | `attendance:view` | Partner–Intern |
| Apply Leave | `leave:apply` | Partner, Manager, Staff, Intern — **not Admin** |
| Leave Management | `leave:manage` | Partner, Admin, Manager |
| Messages | `messages:view` | Staff roles + Client |
| Billing | `invoices:view` | Partner, Admin, Manager |
| Management Reports | `reports:export` | Partner, Admin |
| Settings | `settings:view` | Partner, Admin |

**Leave flow:** Staff applies → Manager approves (step 1) → Partner or Admin sanctions (final). Admin cannot apply leave; Admin uses **Leave Management** only.
