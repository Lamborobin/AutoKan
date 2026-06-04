/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['IBM Plex Sans', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      colors: {
        surface: {
          0: 'rgb(var(--surface-0) / <alpha-value>)',
          1: 'rgb(var(--surface-1) / <alpha-value>)',
          2: 'rgb(var(--surface-2) / <alpha-value>)',
          3: 'rgb(var(--surface-3) / <alpha-value>)',
          4: 'rgb(var(--surface-4) / <alpha-value>)',
        },
        border: 'rgb(var(--color-border) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          dim: '#5b4fd4',
          glow: 'rgba(124,106,247,0.15)',
        }
      },
      animation: {
        'slide-in':       'slideIn 0.2s ease-out',
        'fade-in':        'fadeIn 0.15s ease-out',
        'spin-slow':      'spinSlow 16s linear infinite',
        'spin-reverse':   'spinReverse 22s linear infinite',
        'pulse-glow':     'pulseGlow 3.5s ease-in-out infinite',
        'logo-glow':      'logoGlow 3s ease-in-out infinite',
        'shimmer':        'shimmer 20s linear infinite',
        'orbit-dot':      'orbitDot 8s linear infinite',
      },
      keyframes: {
        slideIn:      { from: { opacity: 0, transform: 'translateY(8px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        fadeIn:       { from: { opacity: 0 }, to: { opacity: 1 } },
        spinSlow:     { from: { transform: 'rotate(0deg)' },   to: { transform: 'rotate(360deg)' } },
        spinReverse:  { from: { transform: 'rotate(0deg)' },   to: { transform: 'rotate(-360deg)' } },
        pulseGlow: {
          '0%, 100%': { opacity: '0.35', transform: 'scale(0.92)' },
          '50%':      { opacity: '0.65', transform: 'scale(1.08)' },
        },
        logoGlow: {
          '0%, 100%': { filter: 'drop-shadow(0 0 16px rgba(99,102,241,0.4))' },
          '50%':      { filter: 'drop-shadow(0 0 36px rgba(139,92,246,0.75))' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-300% center' },
          '100%': { backgroundPosition: '300% center' },
        },
        orbitDot: {
          from: { transform: 'rotate(0deg) translateX(71.5px) rotate(0deg)' },
          to:   { transform: 'rotate(360deg) translateX(71.5px) rotate(-360deg)' },
        },
      }
    },
  },
  plugins: [],
}
