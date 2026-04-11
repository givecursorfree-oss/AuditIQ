/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: 'var(--color-surface)',
        card: 'var(--color-card)',
        'card-hover': 'var(--color-card-hover)',
        border: 'var(--color-border)',
        primary: {
          DEFAULT: '#0C5CAB',
          hover: '#0a4a8a',
          light: 'rgba(12,92,171,0.2)',
        },
        muted: 'var(--color-muted)',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
        info: '#3b82f6',
        'input-bg': 'var(--color-input-bg)',
        'input-border': 'var(--color-input-border)',
        'border-subtle': 'var(--color-border)',
        foreground: 'var(--color-foreground)',
        'foreground-secondary': 'var(--color-foreground-secondary)',
        'foreground-muted': 'var(--color-foreground-muted)',
        'hover-bg': 'var(--color-hover-bg)',
      },
      borderColor: {
        DEFAULT: 'var(--color-border)',
      },
    },
  },
  plugins: [],
};
