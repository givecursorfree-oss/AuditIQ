import { Link } from 'react-router-dom';
import { CaretRight as ChevronRight } from '@phosphor-icons/react';

export interface BreadcrumbItem {
  label: string;
  to?: string;
}

export function PageBreadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (!items.length) return null;
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm text-foreground-muted mb-3">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} className="text-foreground-muted/70" aria-hidden />}
          {item.to ? (
            <Link to={item.to} className="hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
