/** Print-shop palette: cyan / magenta / yellow process inks on a deep ink-blue ground */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 950: '#0b1220', 900: '#101a2e', 800: '#18243d', 700: '#25344f', 500: '#7c8cab', 300: '#b4bfd4', 100: '#eef2fa' },
        pc: '#00aeef',
        pm: '#ec008c',
        py: '#ffd400'
      },
      fontFamily: { sans: ['ui-rounded', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] }
    }
  }
};
