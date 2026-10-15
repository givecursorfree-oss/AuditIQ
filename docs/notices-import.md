# Notices Import - basic

## Data import

- Import one Excel workbook for one GST client. It might contain various other data, including relevant data:
- Read the client GSTIN from `Basic!A2` and validate it before import.
- Read notices only from the `Notices` sheet.
- Read the following preferred `Notices` sheet headers: `Notice/Demand Order Id`, `Type`, `Notice / Order Description`, `Date of Issuance`, `Due Date`, `Period`, `Status`, and `Assigned To`.
- Also accept existing export aliases: `Notice / Order ID` for the ID and `Description` for the description.
- Treat `NA` due date as Not Applicable; treat `As Applicable*`, blank, or an em dash as Due Unclear.
- Ignore source other columns, Action/View links, other worksheets, pictures, and embedded workbook content.


## Notices dashboard

Show one selected client's notices with:

- last portal-check time and whether the import/portal data is complete or partial;
- filter and sort-able columns for Notice / Order ID, Period, Type, Description, Issue Date, Due Date, Status, Assigned To, Notes / Comments, and Edit;
- readable dates and clear empty values;
- a New, Updated, or Seen badge on each notice;
- an Edit action for each stable notice ID;
- loading, empty, import-error, and no-filter-match states.

Use the imported workbook order as the default order. Preserve the order of updated/new portal rows when the source workbook provides it.

## Notice state

- A notice created by import starts as **New**.
- When a user marks its current version as seen, it becomes **Seen**.
- If a meaningful portal field changes after it was seen, it becomes **Updated**.
- If it changes before being seen, it remains **New**.
- Incoming source `Notice Status` values do not control the receiving application's badge state.

## Edit notice

Allow users to edit these fields:

| Field | Rule |
|---|---|
| Type | Text, up to 40 characters |
| Period | Text, up to 12 characters |
| Issue Date | Optional date |
| Due Date | Optional date |
| Description | Text, up to 100 characters |
| Status | Auto, Responded, Drop order received, Demand order received, Just FYI, or Custom |
| Custom status | Required when Custom is selected; up to 30 characters |
| Follow-up | None, Appeal, Payment, Hearing, or Custom |
| Custom follow-up | Required when Custom is selected; up to 24 characters |
| Follow-up due date | Optional; disabled and cleared for None |
| Assigned To | Text, up to 40 characters |
| Notes / Comments | Text, up to 1000 characters |
| Edited by | Required text, up to 40 characters |

- Show a live primary-status preview and optional follow-up preview.
- Auto status is calculated from the notice due date: overdue, due today, days left, not applicable, or refer to notice document.
- Follow-up has its own due-date countdown and does not change the notice due-date filters.
- Save only when there is a real change and Edited by is present.
- Cancel discards edits.
- Prevent duplicate saves.
- Detect an edit conflict when the record changes after the modal opened; show current values and allow reload rather than silently overwriting.

## Import and hosted edits

Keep imported portal data separate from hosted user edits.

- Portal/imported fields are Type, Description, Issue Date, Due Date, and Period.
- A repeated import with unchanged values preserves any hosted override.
- A meaningful changed portal value replaces the imported value and removes the matching override.
- Blank or unknown source values do not erase a valid imported value.
- Status and Assigned To seed a record only on its first import; later imports must not overwrite receiving-app users.
- Follow-up, Notes, and notice viewing state are always owned by the receiving app.
- A notice missing from a later workbook is not deleted.

## Import result

After import, show GSTIN validation plus rows read, created, updated, unchanged, and skipped. For skipped rows, show the row number and a clear safe reason.
