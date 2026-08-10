import { PublicAuthShell } from '@/components/layout/PublicAuthShell';

function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-foreground">{heading}</h2>
      <div className="text-sm text-muted-foreground leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

export function PrivacyPolicy() {
  return (
    <PublicAuthShell title="Privacy Policy" subtitle="Last updated: June 2026">
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        <LegalSection heading="Overview">
          <p>
            AuditIQ India (&quot;we&quot;, &quot;our&quot;) processes personal and client data solely to deliver audit,
            tax, and compliance services for registered CA firms and their clients.
          </p>
        </LegalSection>
        <LegalSection heading="Data we collect">
          <p>
            Account details (name, email, role), engagement and document metadata, attendance and time records,
            and messages exchanged within the platform. Client-uploaded files remain the property of the client
            and the engaging firm.
          </p>
        </LegalSection>
        <LegalSection heading="How we use data">
          <p>
            To authenticate users, operate engagements, generate reports, and meet statutory record-keeping
            obligations. We do not sell personal data to third parties.
          </p>
        </LegalSection>
        <LegalSection heading="Your rights">
          <p>
            Users may request access, correction, or deletion subject to firm policy and legal retention
            requirements. Contact your firm administrator or privacy@auditiq.in.
          </p>
        </LegalSection>
      </div>
    </PublicAuthShell>
  );
}

export function TermsOfService() {
  return (
    <PublicAuthShell title="Terms of Service" subtitle="Last updated: June 2026">
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        <LegalSection heading="Acceptance">
          <p>
            By accessing AuditIQ you agree to these terms on behalf of yourself and, where applicable, your CA firm.
            If you do not agree, do not use the service.
          </p>
        </LegalSection>
        <LegalSection heading="Permitted use">
          <p>
            The platform is for professional audit, tax, and compliance work. You must not misuse credentials,
            upload unlawful content, or attempt to bypass access controls.
          </p>
        </LegalSection>
        <LegalSection heading="Firm responsibility">
          <p>
            Each firm is responsible for user provisioning, client consent, and accuracy of submissions.
            AuditIQ provides software tools; professional judgments remain with licensed practitioners.
          </p>
        </LegalSection>
        <LegalSection heading="Availability">
          <p>
            We aim for high availability but do not guarantee uninterrupted service. Planned maintenance will
            be communicated where practicable.
          </p>
        </LegalSection>
      </div>
    </PublicAuthShell>
  );
}

export function SecurityCompliance() {
  return (
    <PublicAuthShell title="Security & Compliance" subtitle="AuditIQ security practices">
      <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
        <LegalSection heading="Access control">
          <p>
            Role-based permissions, route guards, and per-engagement scoping limit data access. Sessions use
            signed tokens with secure HTTP-only cookies where configured.
          </p>
        </LegalSection>
        <LegalSection heading="Data protection">
          <p>
            Passwords are hashed with industry-standard algorithms. Sensitive vault entries use additional
            encryption at rest. TLS is required for production deployments.
          </p>
        </LegalSection>
        <LegalSection heading="Audit trail">
          <p>
            Administrative actions, permission changes, and key workflow events are logged for firm oversight
            and regulatory review.
          </p>
        </LegalSection>
        <LegalSection heading="Reporting issues">
          <p>
            Report suspected vulnerabilities to security@auditiq.in. Do not publicly disclose issues before
            coordinated remediation.
          </p>
        </LegalSection>
      </div>
    </PublicAuthShell>
  );
}
