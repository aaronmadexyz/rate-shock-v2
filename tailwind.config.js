/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans:    ['var(--font-sans)', 'system-ui', 'sans-serif'],
        mono:    ['var(--font-mono)', 'SF Mono', 'monospace'],
        display: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Neutrals
        'n-0':   '#FFFFFF',
        'n-25':  '#FAFAF8',
        'n-50':  '#F5F4F1',
        'n-100': '#EEEDEA',
        'n-150': '#E2E1DD',
        'n-200': '#D4D3CE',
        'n-300': '#B8B7B1',
        'n-400': '#9A998F',
        'n-500': '#7C7B72',
        'n-600': '#5E5D56',
        'n-700': '#43423D',
        'n-800': '#2C2B27',
        'n-900': '#1A1917',

        // Primary — indigo
        'p-50':  '#EEEFFA',
        'p-100': '#D5D7F2',
        'p-200': '#B0B4E6',
        'p-400': '#636AC5',
        'p-500': '#4A50B0',
        'p-600': '#3A3F8F',
        'p-700': '#2D3170',

        // Positive — sage
        'pos-50':  '#EDF7F0',
        'pos-400': '#3A9B55',
        'pos-500': '#2A7D41',
        'pos-600': '#1F6132',

        // Caution — amber
        'cau-50':  '#FEF6E8',
        'cau-400': '#D49316',
        'cau-500': '#AD7710',
        'cau-600': '#845A0C',

        // Negative — coral
        'neg-50':  '#FDF0EE',
        'neg-400': '#D4503A',
        'neg-500': '#B33C28',
        'neg-600': '#8C2E1E',
      },
    },
  },
  plugins: [],
}
