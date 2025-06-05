module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          DEFAULT: '#0f0f0f',
          secondary: '#1a1a2e',
          card: '#1c1c2c',
          header: '#10101a',
          input: '#2a2a3d',
          hover: '#3a3a4d'
        }
      }
    },
  },
  plugins: [],
}