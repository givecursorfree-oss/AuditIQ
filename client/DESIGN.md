# AuditIQ Design System

**Direction:** Option A — **Slate Executive** (enterprise B2B). Cool slate neutrals dominate the UI; brand blue is reserved for primary actions, links, and intentional emphasis—not decorative washes.

## Brand

| Token | Value | Usage |
|-------|-------|--------|
| `primary` | `#1E40AF` | Primary buttons, text links, form CTAs |
| `primary-hover` | `#1E3A8A` | Button hover |
| `primary-light` | `#EFF6FF` | Info alerts, primary badges (sparingly) |
| `navy` / sidebar | `#0F172A` | Sidebar shell (light + dark) |
| Focus ring | `#94A3B8` | Inputs, icon buttons (slate—not brand blue) |

CSS variables live in `client/src/index.css`; Tailwind maps `primary` and `ring` to those vars in `tailwind.config.js`.

## Neutrals (slate)

| Token | Light | Usage |
|-------|-------|--------|
| Surface | `#F8FAFC` | Page background |
| Surface muted | `#F1F5F9` | Icon wells, table headers, selected rows |
| Card | `#FFFFFF` | Panels, modals |
| Foreground | `#0F172A` | Headings, body |
| Secondary | `#475569` | Subheads, table secondary |
| Muted | `#64748B` | Labels, captions |
| Border | `#E2E8F0` | Cards, inputs |

## Semantic

| Role | Hex |
|------|-----|
| Success | `#059669` |
| Warning | `#D97706` |
| Danger | `#DC2626` |
| Info | `#2563EB` |

## Typography

- **Sans:** IBM Plex Sans — UI copy
- **Mono:** IBM Plex Mono — PAN, GSTIN, UDIN, amounts (`.font-data`)

| Scale | Size / weight |
|-------|----------------|
| Display | 32px / 700 (login only) |
| H1 | 24px / 700 |
| H2 | 16px / 600 |
| H3 | 14px / 600 |
| Body | 14px / 400 |
| Caption | 12px / 400 |

## Layout

- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48
- Card radius: 12px (`rounded-xl`)
- Card border: 1px slate border, light shadow

## Components

- **Sidebar:** Slate `#0F172A`; active item = white 10% fill + **left inset indicator** (not blue pill)
- **Icon wells:** `.icon-well`, `.icon-well-sm`, `.icon-well-md` — neutral `surface-muted` background
- **List selection:** `.list-item-active` — muted bg + left border
- **Tabs (content):** `.tab-active` — foreground underline (not primary border)
- **Stat / metric tiles:** Neutral icon well + `.kpi-label` + `.kpi-value`
- **Tables:** Uppercase 12px headers on `surface-muted` background
- **Login brand panel:** Slate gradient only (no blue wash)
- **Copilot:** Glass/aurora isolated to copilot routes only

## Colour discipline

| Use primary blue | Use slate neutrals |
|------------------|-------------------|
| Primary buttons | Sidebar active state |
| Text links | Icon circles / KPI icons |
| “Forgot password”, register links | Search focus rings |
| Primary badges (when meaningful) | Folder/list selection |
| Chart “active” series (single accent) | Segmented control selection |

## Contrast rules

- Body on white ≥ `#475569` for secondary text
- Never white text except on navy sidebar or primary buttons
- Status colour on badges/icons only — not full card backgrounds

## Refactoring UI checklist

| Principle | Implementation |
|-----------|----------------|
| Hierarchy via size/weight | `.page-title`, `.section-title`, `.kpi-value` vs `.kpi-label` |
| Limited type scale | H1 page only; card titles 16px; body 14px |
| Spacing scale | `.page-stack`, `.page-toolbar`, layout padding |
| Depth without noise | `.card` shadow; `.card-interactive` hover only |
| Colour with purpose | Brand primary for actions; neutrals for chrome |
| Consistent chrome | `PageHeader`, header search on `surface-muted`, slate focus rings |
