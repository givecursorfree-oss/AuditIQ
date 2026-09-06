import { LOGO_DARK_URL, LOGO_LIGHT_URL } from '@/lib/branding';
import { cn } from '@/lib/utils';

type LogoProps = {
  className?: string;
  /** Pin variant for fixed backgrounds (e.g. login brand panel is always dark). */
  forceTheme?: 'light' | 'dark';
};

/** Official AuditIQ wordmark — transparent PNGs, no plate behind the mark. */
export default function AuditIQLogo({ className = '', forceTheme }: LogoProps) {
  if (forceTheme === 'dark') {
    return (
      <img
        src={LOGO_DARK_URL}
        alt="AuditIQ"
        className={cn('bg-transparent', className)}
        draggable={false}
        decoding="async"
      />
    );
  }

  if (forceTheme === 'light') {
    return (
      <img
        src={LOGO_LIGHT_URL}
        alt="AuditIQ"
        className={cn('bg-transparent', className)}
        draggable={false}
        decoding="async"
      />
    );
  }

  return (
    <>
      <img
        src={LOGO_LIGHT_URL}
        alt="AuditIQ"
        className={cn('bg-transparent dark:hidden', className)}
        draggable={false}
        decoding="async"
      />
      <img
        src={LOGO_DARK_URL}
        alt="AuditIQ"
        className={cn('bg-transparent hidden dark:block', className)}
        draggable={false}
        decoding="async"
      />
    </>
  );
}
