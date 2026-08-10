import type { PrismaClient } from '@prisma/client';
import { extractTemplateVariables } from './templateRenderer.js';

export type SeedTemplate = {
  name: string;
  category: string;
  serviceTypes: string[];
  subject: string;
  body: string;
  attachPdf?: boolean;
};

export const MKD_DOCUMENT_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Standard MKD Engagement Letter',
    category: 'engagement_letter',
    serviceTypes: [],
    subject: 'Engagement Letter for {{SERVICE_DESCRIPTION}} for {{FINANCIAL_YEARS}}',
    body: `Engagement Letter

{{DATE}}

To
The Management,
{{CLIENT_NAME}}

Sub: Engagement Letter for {{SERVICE_DESCRIPTION}} for the Financial Year(s) {{FINANCIAL_YEARS}}.

Dear Sir/Madam,

With reference to our discussion, we are pleased to set out below the scope of services to be rendered by us:

Scope of Services:
{{SCOPE_OF_SERVICES}}

Scope and Process:
{{SCOPE_AND_PROCESS}}

Professional Fees:
Our professional fees for the above services shall be as under:

{{FEE_TABLE}}

General Terms:
- The scope of our services is limited to the matters specifically mentioned above.
- The services shall be rendered based on the information and documents provided by the team.
- Timeframes are contingent upon the timely receipt of all necessary information and documentation from the team.
- Any additional services outside the above scope shall be mutually discussed and invoiced separately.

Kindly acknowledge your acceptance of the above terms and conditions.

Thanking you,

For M. K. Dandeker & Co LLP,
Chartered Accountants

{{PARTNER_NAME}}
Partner

---

Accepted and Agreed:

We ({{CLIENT_NAME}}) acknowledge receipt of this letter and agree with the terms of your (MKD) engagement set out therein.

For {{CLIENT_NAME}}

Authorised Signatory

Date: ___________`,
    attachPdf: true,
  },
  {
    name: 'GSTR Monthly Data Request Letter',
    category: 'gstr_monthly_letter',
    serviceTypes: ['GSTR_1', 'GSTR_3B'],
    subject: 'Data Required for GSTR Filing — {{FINANCIAL_YEAR}} — {{MONTH}}',
    body: `Dear {{CLIENT_NAME}},

This is to inform you that the due date for filing GSTR-1 is approaching.
Kindly share the following data at the earliest:
- Sales invoices for the month of {{MONTH}}
- Purchase invoices and credit/debit notes
- Export details (if applicable)
- E-way bill summary (if applicable)

Please share the data by {{DATA_DEADLINE_DATE}} to ensure timely filing.

For {{FIRM_NAME}}`,
  },
  {
    name: 'Advance Tax Request Letter',
    category: 'advance_tax_request',
    serviceTypes: ['ADVANCE_TAX'],
    subject: 'Advance Tax — {{INSTALLMENT}} Installment — Due {{DEADLINE_DATE}}',
    body: `Dear {{CLIENT_NAME}},

The {{INSTALLMENT}} installment of Advance Tax for FY {{FINANCIAL_YEAR}} is due on {{DEADLINE_DATE}}.
Kindly share the estimated income and tax liability details to enable us to compute the advance tax payable.

Please provide:
- Estimated total income for the financial year
- TDS/TCS credits available
- Details of capital gains or other special income

For {{FIRM_NAME}}`,
  },
  {
    name: 'GST Notice Communication Template',
    category: 'notice_communication',
    serviceTypes: ['GST_NOTICES'],
    subject: 'Notice Received — Action Required — {{NOTICE_TYPE}}',
    body: `Dear Sir/Madam,

With reference to the notice received from {{AUTHORITY}}, bearing reference {{REFERENCE_NUMBER}},
please share the following documents / records so we can prepare the reply:
- Copy of the notice
- Relevant returns and reconciliations for the period cited
- Supporting invoices and ledgers

For {{FIRM_NAME}}`,
  },
  {
    name: 'TP Study Report Yearly Request',
    category: 'tp_study_request',
    serviceTypes: ['TP_STUDY'],
    subject: 'Transfer Pricing Study Report — FY {{FINANCIAL_YEAR}} — Data Request',
    body: `Dear {{CLIENT_NAME}},

As you are aware, the Transfer Pricing Study Report for FY {{FINANCIAL_YEAR}} is required to be
submitted by {{DEADLINE_DATE}}. We request you to share the following information:
- Related party transaction details
- Segment-wise revenue and cost break-up
- Comparable company search inputs
- Inter-company agreements

For {{FIRM_NAME}}`,
  },
  {
    name: 'TDS Monthly Data Request',
    category: 'tds_monthly_letter',
    serviceTypes: ['TDS_REMITTANCE', 'TDS_QUARTERLY'],
    subject: 'TDS — Monthly data request for {{MONTH_YEAR}}',
    body: `Dear {{CLIENT_NAME}},

Please share the following for TDS compliance for {{MONTH_YEAR}}:
- Salary register and challan details
- Contractor payments and TDS deducted
- Form 16 / 16A requirements if applicable

For {{FIRM_NAME}}`,
  },
  {
    name: 'Income Tax Notice Data Request',
    category: 'it_notice_request',
    serviceTypes: ['NOTICES', 'DEPT_FOLLOWUP'],
    subject: 'Income Tax notice — documents required',
    body: `Dear {{CLIENT_NAME}},

We need documents to respond to the Income Tax notice for your matter:
- Copy of notice and prior correspondence
- Relevant returns and computations
- Supporting schedules and ledgers

For {{FIRM_NAME}}`,
  },
];

export async function seedDocumentTemplates(
  prisma: PrismaClient,
  firmId: string,
  createdById?: string
): Promise<number> {
  let created = 0;
  for (const tpl of MKD_DOCUMENT_TEMPLATES) {
    const existing = await prisma.documentTemplate.findFirst({
      where: { firmId, name: tpl.name },
    });
    if (existing) continue;

    const variables = [
      ...new Set([
        ...extractTemplateVariables(tpl.subject),
        ...extractTemplateVariables(tpl.body),
      ]),
    ];

    await prisma.documentTemplate.create({
      data: {
        firmId,
        createdById: createdById ?? null,
        name: tpl.name,
        category: tpl.category,
        serviceTypes: tpl.serviceTypes,
        subject: tpl.subject,
        body: tpl.body,
        attachPdf: tpl.attachPdf ?? false,
        variables,
      },
    });
    created++;
  }
  return created;
}
