/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
      colors: {
        terminal: {
          bg: '#0f0f0f',
          green: '#00ff88',
          white: '#e5e7eb',
          gray: '#4b5563',
          dim: '#374151',
        },
      },
    },
  },
  plugins: [],
}
