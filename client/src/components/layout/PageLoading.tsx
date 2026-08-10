interface PageLoadingProps {
  className?: string;
}

export default function PageLoading({ className = 'py-24' }: PageLoadingProps) {
  return (
    <div className={`flex items-center justify-center ${className}`}>
      <output
        className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent list-none"
        aria-label="Loading"
      />
    </div>
  );
}
