import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src')
      }
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        output: {
          // Keep mermaid in its own chunk so the dynamic import() in
          // Preview.tsx actually defers ~1MB of JS until a note uses it.
          manualChunks: {
            codemirror: ['@codemirror/view', '@codemirror/state', '@codemirror/lang-markdown']
          }
        }
      }
    }
  }
})
