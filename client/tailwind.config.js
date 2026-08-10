/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        navy: {
          900: '#0F172A',
          800: '#1E293B',
          700: '#334155',
        },
        surface: {
          DEFAULT: 'var(--color-surface)',
          muted: 'var(--color-surface-muted)',
        },
        sidebar: {
          DEFAULT: 'var(--color-sidebar)',
          foreground: 'var(--color-sidebar-foreground)',
          muted: 'var(--color-sidebar-muted)',
          border: 'var(--color-sidebar-border)',
          accent: 'var(--color-sidebar-accent)',
          active: 'var(--color-sidebar-active)',
        },
        card: 'var(--color-card)',
        'card-hover': 'var(--color-card-hover)',
        border: 'var(--color-border)',
        primary: {
          DEFAULT: 'var(--color-brand-primary)',
          hover: 'var(--color-brand-primary-hover)',
          light: 'var(--color-brand-primary-light)',
          foreground: '#ffffff',
        },
        muted: {
          DEFAULT: 'var(--muted)',
          foreground: 'var(--muted-foreground)',
        },
        success: '#059669',
        warning: '#D97706',
        danger: '#DC2626',
        info: '#2563EB',
        'input-bg': 'var(--color-input-bg)',
        'input-border': 'var(--color-input-border)',
        'border-subtle': 'var(--color-border)',
        foreground: 'var(--color-foreground)',
        'foreground-secondary': 'var(--color-foreground-secondary)',
        'foreground-muted': 'var(--color-foreground-muted)',
        'hover-bg': 'var(--color-hover-bg)',
        background: 'var(--color-background)',
        secondary: {
          DEFAULT: 'var(--color-surface-muted)',
          foreground: 'var(--color-foreground-secondary)',
        },
        accent: {
          DEFAULT: 'var(--color-hover-bg)',
          foreground: 'var(--color-foreground)',
        },
        popover: {
          DEFAULT: 'var(--popover, var(--color-card))',
          foreground: 'var(--popover-foreground, var(--color-foreground))',
        },
        destructive: {
          DEFAULT: '#DC2626',
          foreground: '#ffffff',
        },
        ring: 'var(--ring, var(--color-focus-ring, #94A3B8))',
        chart: {
          1: 'var(--chart-1)',
          2: 'var(--chart-2)',
          3: 'var(--chart-3)',
          4: 'var(--chart-4)',
          5: 'var(--chart-5)',
        },
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      boxShadow: {
        card: '0 1px 3px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 2px 8px rgba(0, 0, 0, 0.06)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
