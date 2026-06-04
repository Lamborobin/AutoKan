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
        'orbit-dot-sm':   'orbitDotSm 8s linear infinite',
        'blob-1':         'blob1 24s ease-in-out infinite',
        'blob-2':         'blob2 30s ease-in-out infinite',
        'blob-3':         'blob3 20s ease-in-out infinite',
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
          '0%, 100%': { opacity: '0.45' },
          '50%':      { opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-300% center' },
          '100%': { backgroundPosition: '300% center' },
        },
        orbitDot: {
          from: { transform: 'rotate(0deg) translateX(55px) rotate(0deg)' },
          to:   { transform: 'rotate(360deg) translateX(55px) rotate(-360deg)' },
        },
        orbitDotSm: {
          from: { transform: 'rotate(0deg) translateX(32px) rotate(0deg)' },
          to:   { transform: 'rotate(360deg) translateX(32px) rotate(-360deg)' },
        },
        blob1: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '25%':      { transform: 'translate(70px, -90px) scale(1.06)' },
          '50%':      { transform: 'translate(130px, 50px) scale(0.94)' },
          '75%':      { transform: 'translate(-40px, 80px) scale(1.09)' },
        },
        blob2: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '33%':      { transform: 'translate(-90px, 70px) scale(1.1)' },
          '66%':      { transform: 'translate(80px, -60px) scale(0.91)' },
        },
        blob3: {
          '0%, 100%': { transform: 'translate(0px, 0px) scale(1)' },
          '40%':      { transform: 'translate(60px, 100px) scale(1.07)' },
          '80%':      { transform: 'translate(-80px, -50px) scale(0.95)' },
        },
      }
    },
  },
  plugins: [],
}
