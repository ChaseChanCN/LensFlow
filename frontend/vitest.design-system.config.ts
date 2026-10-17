import { defineConfig, mergeConfig } from 'vitest/config'
import base from './vite.config.ts'

export default mergeConfig(base, defineConfig({
  test: {
    include: ['src/components/ui/*.test.tsx'],
    coverage: {
      provider: 'v8',
      include: ['src/components/ui/{Button,Input,Spinner,EmptyState,Toast,Modal,modalManager,PageState}.{ts,tsx}', 'src/stores/toast.ts'],
      reporter: ['text', 'json-summary'],
      reportsDirectory: '../.agentwork/design-system/p2-coverage',
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 80 },
    },
  },
}))
