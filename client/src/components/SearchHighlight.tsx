/** Renders Typesense highlight snippets with safe <mark> emphasis only. */
export default function SearchHighlight({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const safe = text.replace(/<(?!\/?mark\b)[^>]*>/gi, '');
  const parts = safe.split(/(<mark>[\s\S]*?<\/mark>)/gi);

  return (
    <p className={className}>
      {parts.map((part) => {
        const match = /^<mark>([\s\S]*)<\/mark>$/i.exec(part);
        if (match) {
          return (
            <mark
              key={`mark:${match[1]}`}
              className="bg-primary/25 text-foreground rounded-sm px-0.5 not-italic font-medium"
            >
              {match[1]}
            </mark>
          );
        }
        return part ? <span key={`text:${part}`}>{part}</span> : null;
      })}
    </p>
  );
}
