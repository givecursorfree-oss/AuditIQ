import type { ChartConfig } from '@/components/ui/chart-types';

const THEMES = { light: '', dark: '.dark' } as const;

export function ChartStyle({ id, config }: { id: string; config: ChartConfig }) {
  const colorConfig = Object.entries(config).filter(([, c]) => c.theme ?? c.color);
  if (!colorConfig.length) return null;

  const cssBlocks: string[] = [];
  for (const [theme, prefix] of Object.entries(THEMES)) {
    const lines: string[] = [];
    for (const [key, itemConfig] of colorConfig) {
      const color =
        itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ?? itemConfig.color;
      if (color) lines.push(`  --color-${key}: ${color};`);
    }
    if (lines.length) {
      cssBlocks.push(`${prefix} [data-chart=${id}] {\n${lines.join('\n')}\n}`);
    }
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: cssBlocks.join('\n'),
      }}
    />
  );
}
