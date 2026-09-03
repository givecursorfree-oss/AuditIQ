interface PageLoadingProps {
  className?: string;
  /** Visible status for screen readers and sighted users */
  label?: string;
}

export default function PageLoading({ className = 'py-24', label = 'Loading…' }: PageLoadingProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <output
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent list-none"
        aria-hidden="true"
      />
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
