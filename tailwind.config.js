/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Space Grotesk', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        quantum: {
          bg: '#0A0E17',
          bgSecondary: '#0F1520',
          card: '#131A2A',
          cardHover: '#182035',
          border: '#1E2A3F',
          fg: '#E8ECF4',
          fgMuted: '#6B7A94',
          accent: '#00E68A',
          accentDim: 'rgba(0, 230, 138, 0.15)',
          accentGlow: 'rgba(0, 230, 138, 0.3)',
          gold: '#FFB800',
          goldDim: 'rgba(255, 184, 0, 0.15)',
          red: '#FF4757',
          redDim: 'rgba(255, 71, 87, 0.15)',
          purple: '#A855F7',
          purpleDim: 'rgba(138, 43, 226, 0.15)'
        }
      },
      animation: {
        'float': 'float 4s ease-in-out infinite',
        'shimmer': 'shimmer 3s linear infinite',
        'quantumPulse': 'quantumPulse 2s ease-in-out infinite',
        'tickerScroll': 'tickerScroll 30s linear infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        quantumPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(0, 230, 138, 0.3)' },
          '50%': { boxShadow: '0 0 0 8px transparent' },
        },
        tickerScroll: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        }
      },
    },
  },
  plugins: [],
}