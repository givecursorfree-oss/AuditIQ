# Claims V1 — Concise Spec

> Source: firm late-sitting / reimbursement requirements. Cursor agents: see also `.cursor/rules/claims-expense-phases.mdc` for V1 vs Phase 2 boundaries.

## 1. Navigation

Add under **TEAM**:

```text
Claims
```

Existing **Approvals** remains the manager approval inbox.

Claims has two distinct claim types:

```text
Food Claim
Travel Claim
```

They use the same underlying claim/approval architecture, but **type-specific rules must remain separate**. In particular, late-sitting timing rules apply to Food Claims only unless later configured otherwise.

---

## 2. Employee — New Claim

First action:

```text
New Claim

[ Food Claim ]   [ Travel Claim ]
```

### Common fields

```text
Amount              ₹ [manual entry]
Engagement           [existing engagement ▼]
Client               [derived/select ▼]
Type of Work         [existing type ▼]
                     [Other → custom text]
Date
Receipt / Proof      [Upload]
                     [multiple images supported]

[Submit]
```

One claim = **one employee + one amount + one engagement + one client + one work type + one or more images**.

For V1, keep Travel Claim on the same basic structure. Do not invent a large travel-expense schema until its exact requirements are defined.

---

## 3. Food Claim rules

Maintain current late-sitting policy:

* Mon–Fri: ≥ 7:00 PM
* Saturday: ≥ 2:00 PM
* Sunday: exception

Current workflow already performs these checks.

However:

```text
Never block employee submission.
```

Policy exceptions are visible **only to the approving manager**.

---

## 4. OCR — **Phase 2** (not V1)

Employee manually enters the amount.

After receipt upload:

```text
Employee sees:     ₹520
Employee does NOT see OCR result.
```

OCR runs in the background and attempts to identify the **final total paid**, following the existing comprehensive-total rule rather than subtotal.

Manager sees:

```text
Claimed:       ₹520
OCR detected:  ₹518
```

OCR is advisory and never changes the claimant-entered amount.

**Phase 2 additional validation:** cross-check with **thumbprint out-time** and **app logout time** (manager-visible; do not block submission by default).

---

## 5. Manager Approval Screen

Claims appear in **Approvals immediately after submission**.

Dense single-line layout:

```text
Claimant | Amount | Engagement | Type of Work | IMG
```

Example:

```text
Pragadisan | ₹520 | ABC Audit | GST Return | [IMG] >
```

Add Claim Type visibly but compactly, e.g.:

```text
[F] Pragadisan | ₹520 | ABC Audit | GST Return | [IMG] >
[T] Arjun      | ₹850 | XYZ Ltd   | Stat Audit | [IMG] >
```

`F = Food`, `T = Travel`.

### Image control

Toolbar:

```text
[ ] Show images inline
```

When enabled:

```text
Pragadisan | ₹520 | ABC Audit | GST Return | [ receipt image ] >
```

For multiple images:

```text
<  [IMAGE]  >    1/3
```

Click image → full-screen/lightbox preview.

Controls:

```text
X / Esc          close
← / →            previous/next
Zoom             supported
```

No separate attachment page.

---

## 6. Manager actions

Manager can only:

```text
Approve
Reject
Approve Limited Amount
```

Manager **cannot edit** employee-entered claim details.

### Reject

```text
Reason: mandatory
```

Reason is stored internally and **not shown to the employee**.

### Approve Limited Amount

Example:

```text
Claimed:          ₹620
Approved:         ₹500
Reason:           [mandatory]
```

Store both values separately.

Never modify the original ₹620 claim.

---

## 7. Approval authority

Normal:

```text
Employee
   ↓
Reporting Manager
   ↓
Final claim approval
```

Managers are the final authority for individual claims.

One configurable manager is allowed to approve their own claims.

Implement this as a permission/configuration, not name-specific logic.

No special self-approval label needs to appear in the UI.

---

## 8. Claim statuses

Keep simple:

```text
Draft
Pending Approval
Approved
Partially Approved
Rejected
```

Separately track financial processing:

```text
Unprocessed
In Batch
Partner Approved
Accounts Approved
Paid
```

Do not combine all of these into one complicated status field.

---

## 9. Batch / Partner Approval

Approved individual claims can be grouped dynamically by:

```text
Date
Department
Engagement
Client
Custom selection
```

Database remains independent of these groupings.

Flow:

```text
Manager-approved claims
        ↓
Create Batch
        ↓
Excel / PDF-like preview
        ↓
Partner approves entire batch
        ↓
Accounts
        ↓
Paid
```

Partner does **not** re-approve individual claims.

---

## 10. Excel / PDF

Database becomes the source of truth.

Excel/PDF are generated outputs.

```text
Claims DB
   ↓
Selected Batch
   ├─ On-screen preview
   ├─ Excel
   └─ PDF
```

Keep output visually close to the existing reimbursement format so partner/accounts review remains familiar. The current template already contains claimant amounts, client/manager data, work details and total expenses.

The existing Python Excel manipulation therefore becomes unnecessary for normal claim processing; any retained Python should mainly generate/export the final workbook.

---

## 11. Accounts

Simple batch list:

```text
Batch | Type | Period | Claims | Amount | Status
```

Open batch:

```text
Claimant | Approved Amount | Engagement | Work | Receipt
```

Actions:

```text
Export Excel
Export PDF
Approve for Payment
Mark Paid
```

---

## 12. Minimal audit trail

Internally retain:

```text
Created
Submitted
OCR completed
Approved
Partially approved
Rejected
Batch created
Partner approved
Accounts approved
Paid
```

Each event only needs:

```text
actor
timestamp
action
claim/batch ID
relevant old/new value
```

No need to expose a complex audit screen in V1.

---

### Core V1 flow

```text
Food / Travel Claim
        ↓
Employee enters amount + uploads proof
        ↓
Policy checks silently (OCR in Phase 2)
        ↓
Manager sees claim + image + OCR/exception (Phase 2)
        ↓
Approve / Reject / Limited Approval
        ↓
Approved claims grouped into batch
        ↓
Excel/PDF preview
        ↓
Partner batch approval
        ↓
Accounts
        ↓
Paid
```

This should be the boundary of V1; the implementation can fit the repository's existing auth, database, storage and TSX patterns rather than introducing a separate reimbursement architecture.
