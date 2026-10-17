import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom lacks matchMedia; real effect libraries read it during existing page tests.
// This test-only shim does not alter production themes or motion behavior.
if (!window.matchMedia) {
  window.matchMedia = (media: string): MediaQueryList => ({
    media, matches: false, onchange: null,
    addListener: () => {}, removeListener: () => {},
    addEventListener: () => {}, removeEventListener: () => {},
    dispatchEvent: () => true,
  })
}

afterEach(() => {
  cleanup()
})
