import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// base must match the GitHub Pages sub-path (https://<user>.github.io/Bathu-Content-Parser/).
export default defineConfig({
  base: '/Bathu-Content-Parser/',
  plugins: [react()],
})
