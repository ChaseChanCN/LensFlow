import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const css = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const colors = new Map([...css.matchAll(/--color-([\w-]+):\s*(#[\da-f]{6})\s*;/gi)].map((match) => [match[1], match[2]]))
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((channel) => parseInt(channel, 16) / 255)
  const linear = rgb.map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
}
function contrast(foreground, background) {
  const a = luminance(colors.get(foreground))
  const b = luminance(colors.get(background))
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}
const textPairs = [
  ['label', 'surface-primary'],
  ['label', 'surface-secondary'],
  ['label-muted', 'surface-primary'],
  ['label-muted', 'surface-secondary'],
  ['label-inverse', 'error-label'],
  ['label-inverse', 'surface-dark-primary'],
  ['label-inverse', 'action-primary-strong'],
  ['action-primary-strong', 'surface-primary'],
  ...['success', 'warning', 'error', 'info'].map((status) => [`${status}-label`, `${status}-bg`]),
]
for (const [foreground, background] of textPairs) {
  const ratio = contrast(foreground, background)
  console.log(`${foreground} / ${background}: ${ratio.toFixed(2)}:1`)
  assert.ok(ratio >= 4.5, `Ordinary-text pair fails WCAG AA: ${foreground} / ${background}`)
}
for (const [foreground, background] of [['label-inverse', 'action-primary'], ['label-inverse', 'brand-primary']]) {
  console.log(`Decoration/large text only: ${foreground} / ${background}: ${contrast(foreground, background).toFixed(2)}:1`)
}
console.log('Token contrast: all recommended ordinary-text pairs meet 4.5:1. Rendered pages still require a separate audit.')
