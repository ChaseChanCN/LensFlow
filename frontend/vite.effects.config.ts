import { defineConfig, mergeConfig } from 'vite'
import path from 'node:path'
import base from './vite.config.ts'

// Separate artifact: the effects study does not enter the business app entry.
export default mergeConfig(base, defineConfig({
  build: {
    outDir: '../.agentwork/design-system/effects-preview',
    emptyOutDir: true,
    rolldownOptions: { input: path.resolve(import.meta.dirname, 'effects-preview.html') },
  },
}))
