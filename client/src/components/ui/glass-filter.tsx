import * as React from 'react';

export const DEFAULT_GLASS_FILTER_SCALE = 30;
export const BUTTON_GLASS_FILTER_SCALE = 70;

interface GlassFilterProps {
  id: string;
  scale?: number;
}

export const GlassFilter = React.memo(({ id, scale = DEFAULT_GLASS_FILTER_SCALE }: GlassFilterProps) => (
  <svg aria-hidden="true" className="hidden" focusable={false}>
    <title>Glass Effect Filter</title>
    <defs>
      <filter
        colorInterpolationFilters="sRGB"
        height="200%"
        id={id}
        width="200%"
        x="-50%"
        y="-50%"
      >
        <feTurbulence
          baseFrequency="0.05 0.05"
          numOctaves="1"
          result="turbulence"
          seed="1"
          type="fractalNoise"
        />
        <feGaussianBlur in="turbulence" result="blurredNoise" stdDeviation="2" />
        <feDisplacementMap
          in="SourceGraphic"
          in2="blurredNoise"
          result="displaced"
          scale={scale}
          xChannelSelector="R"
          yChannelSelector="B"
        />
        <feGaussianBlur in="displaced" result="finalBlur" stdDeviation="4" />
        <feComposite in="finalBlur" in2="finalBlur" operator="over" />
      </filter>
    </defs>
  </svg>
));
GlassFilter.displayName = 'GlassFilter';
