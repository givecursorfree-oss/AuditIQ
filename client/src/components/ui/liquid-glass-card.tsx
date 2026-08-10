import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { DEFAULT_GLASS_FILTER_SCALE, GlassFilter } from '@/components/ui/glass-filter';
import { GLASS_SHADOW } from '@/components/ui/liquid-glass-button';

const liquidGlassCardVariants = cva(
  'group relative overflow-hidden border-0 bg-transparent shadow-none',
  {
    variants: {
      glassSize: {
        sm: 'p-4',
        default: 'p-6',
        lg: 'p-8',
      },
    },
    defaultVariants: {
      glassSize: 'default',
    },
  }
);

export type LiquidGlassCardProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof liquidGlassCardVariants> & {
    glassEffect?: boolean;
  };

export function LiquidGlassCard({
  className,
  glassSize,
  glassEffect = true,
  children,
  ...props
}: LiquidGlassCardProps) {
  const filterId = React.useId();

  return (
    <Card className={cn(liquidGlassCardVariants({ glassSize }), className)} {...props}>
      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[inherit] bg-white/[0.06] backdrop-blur-[2px]',
          GLASS_SHADOW
        )}
      />

      {glassEffect && (
        <>
          <div
            className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
            style={{ backdropFilter: `url("#${filterId}")` }}
          />
          <GlassFilter id={filterId} scale={DEFAULT_GLASS_FILTER_SCALE} />
        </>
      )}

      <div className="relative z-10">{children}</div>

      <div className="pointer-events-none absolute inset-0 z-20 rounded-[inherit] bg-gradient-to-r from-transparent via-white/5 to-transparent opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 motion-reduce:transition-none" />
    </Card>
  );
}

export { GlassFilter } from '@/components/ui/glass-filter';
