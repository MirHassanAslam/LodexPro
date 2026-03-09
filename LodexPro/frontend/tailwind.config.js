/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'xdm-dark': '#0a0a0a',
        'xdm-accent': '#007bff',
      },
    },
  },
  plugins: [],
}
