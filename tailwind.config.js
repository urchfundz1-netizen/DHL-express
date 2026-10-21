/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './public/**/*.html',
    './public/**/*.js',
    './src/**/*.{html,js}',
  ],
  theme: {
    extend: {
      colors: {
        // SwiftNova brand palette (inspired by the logistics yellow/red language,
        // but an original identity — not affiliated with any existing carrier).
        brand: {
          yellow: '#FFCC00',
          'yellow-600': '#EAB308',
          'yellow-700': '#CA8A04',
          red: '#D40511',
          'red-600': '#B00410',
          'red-700': '#8C030D',
        },
        ink: {
          DEFAULT: '#121417',
          800: '#1B1F24',
          700: '#2A2F36',
          600: '#3A4048',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.06), 0 8px 24px rgba(16,24,40,.08)',
        'card-lg': '0 12px 40px rgba(16,24,40,.16)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(212,5,17,.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(212,5,17,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(212,5,17,0)' },
        },
        'truck-drive': {
          '0%': { left: '0%' },
          '50%': { left: 'calc(100% - 24px)' },
          '100%': { left: '0%' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up .5s ease-out both',
        'fade-in': 'fade-in .5s ease-out both',
        'pulse-ring': 'pulse-ring 1.6s ease-out infinite',
        'truck-drive': 'truck-drive 8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
