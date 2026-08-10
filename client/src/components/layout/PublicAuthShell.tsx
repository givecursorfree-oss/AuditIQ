import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import AuditIQLogo from '../brand/AuditIQLogo';

interface PublicAuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  backTo?: string;
  backLabel?: string;
}

export function PublicAuthShell({
  title,
  subtitle,
  children,
  backTo = '/login',
  backLabel = 'Back to sign in',
}: PublicAuthShellProps) {
  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-lg">
          <Link to={backTo} className="inline-flex items-center text-sm text-foreground-muted hover:text-foreground mb-6">
            ← {backLabel}
          </Link>
          <AuditIQLogo className="h-12 w-auto object-contain mb-6" />
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-card">
            <h1 className="text-xl font-semibold text-foreground tracking-tight">{title}</h1>
            {subtitle && <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{subtitle}</p>}
            <div className="mt-6">{children}</div>
          </div>
        </div>
      </div>
      <footer className="py-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <Link to="/privacy-policy" className="hover:text-foreground">
          Privacy Policy
        </Link>
        <Link to="/terms-of-service" className="hover:text-foreground">
          Terms of Service
        </Link>
        <Link to="/security-compliance" className="hover:text-foreground">
          Security Compliance
        </Link>
      </footer>
    </div>
  );
}
