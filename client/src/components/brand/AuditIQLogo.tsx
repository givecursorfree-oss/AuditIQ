import { LOGO_DARK_URL, LOGO_LIGHT_URL } from '@/lib/branding';
import { cn } from '@/lib/utils';

type LogoProps = {
  className?: string;
  /** Pin variant for fixed backgrounds (e.g. login brand panel is always dark). */
  forceTheme?: 'light' | 'dark';
};

/** Official AuditIQ wordmark — switches with app light/dark theme. */
export default function AuditIQLogo({ className = '', forceTheme }: LogoProps) {
  if (forceTheme === 'dark') {
    return (
      <img
        src={LOGO_DARK_URL}
        alt="AuditIQ"
        className={className}
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
        className={className}
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
        className={cn(className, 'dark:hidden')}
        draggable={false}
        decoding="async"
      />
      <img
        src={LOGO_DARK_URL}
        alt="AuditIQ"
        className={cn(className, 'hidden dark:block')}
        draggable={false}
        decoding="async"
      />
    </>
  );
}
