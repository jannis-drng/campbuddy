import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages liefert das Projekt unter /<repo>/ aus — deshalb der base-Pfad.
// Über VITE_BASE überschreibbar, falls später eine eigene Domain oder Vercel dazukommt.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/campbuddy/',
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist' },
})
