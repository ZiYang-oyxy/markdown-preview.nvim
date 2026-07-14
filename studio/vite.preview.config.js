import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    emptyOutDir: false,
    assetsInlineLimit: 0,
    lib: {
      entry: resolve(import.meta.dirname, 'src/preview/entry.js'),
      formats: ['iife'],
      name: 'MarkdownStudioPreview',
      fileName: () => 'assets/studio-preview.js',
      cssFileName: 'assets/studio-preview',
    },
    sourcemap: false,
  },
})
