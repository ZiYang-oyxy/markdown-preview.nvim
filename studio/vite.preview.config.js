import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: false,
    lib: {
      entry: resolve(import.meta.dirname, 'src/preview/entry.js'),
      formats: ['iife'],
      name: 'MarkdownStudioPreview',
      fileName: () => 'assets/studio-preview.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    sourcemap: false,
  },
})
