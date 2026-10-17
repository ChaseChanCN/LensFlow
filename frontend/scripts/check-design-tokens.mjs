import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { compile } from '@tailwindcss/node'

// Use the same compiler dependency as @tailwindcss/vite, rather than inspecting
// declarations alone: a token in the wrong namespace must fail this check.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = await readFile(resolve(root, 'src/index.css'), 'utf8')
const theme = source.match(/@theme\s+static\s*\{([\s\S]*?)\}/)?.[1]
assert.ok(theme, 'Emit theme variables with @theme static so var() consumers work without utility usage')
const tokens = [...theme.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1])
const namespaces = [
  ['--font-weight-', (name) => `font-${name}`],
  ['--font-', (name) => `font-${name}`],
  ['--color-', (name) => `bg-${name}`],
  ['--text-', (name) => `text-${name}`],
  ['--leading-', (name) => `leading-${name}`],
  ['--spacing-', (name) => `p-${name}`],
  ['--container-', (name) => `max-w-${name}`],
  ['--breakpoint-', (name) => `${name}:bg-brand-primary`],
  ['--radius-', (name) => `rounded-${name}`],
  ['--shadow-', (name) => `shadow-${name}`],
]
const utilityProperties = {
  '--font-weight-': 'font-weight',
  '--font-': 'font-family',
  '--color-': 'background-color',
  '--text-': 'font-size',
  '--leading-': 'line-height',
  '--spacing-': 'padding',
  '--container-': 'max-width',
  '--breakpoint-': 'background-color',
  '--radius-': 'border-radius',
  '--shadow-': 'box-shadow',
}
const candidates = tokens.map((token) => {
  const namespace = namespaces.find(([prefix]) => token.startsWith(prefix))
  assert.ok(namespace, `No utility namespace check for ${token}`)
  return namespace[1](token.slice(namespace[0].length))
})
// These utilities were already used before the migration and must survive.
candidates.push('hover:shadow-elevated', 'focus:shadow-focused', 'bg-accent', 'bg-system-bg')
candidates.push('motion-reduce:animate-none', 'motion-reduce:active:scale-100')
const compiler = await compile(source, { base: resolve(root, 'src'), onDependency() {} })
const css = compiler.build(candidates)
function selectorFor(candidate) {
  const variants = candidate.split(':').slice(0, -1)
  const pseudo = variants.filter((variant) => ['hover', 'focus', 'active'].includes(variant)).map((variant) => `:${variant}`).join('')
  return `.${candidate.replaceAll(':', '\\:')}${pseudo} {`
}
for (const candidate of candidates) {
  assert.ok(css.includes(selectorFor(candidate)), `Missing generated utility: ${candidate}`)
}
for (const token of tokens) {
  const [prefix, makeCandidate] = namespaces.find(([prefix]) => token.startsWith(prefix))
  const selector = selectorFor(makeCandidate(token.slice(prefix.length)))
  const rule = css.slice(css.indexOf(selector) + selector.length).split('}')[0]
  assert.ok(rule.includes(`${utilityProperties[prefix]}:`), `Wrong property for ${token}: utility namespace collision`)
}
const textColorCompiler = await compile(source, { base: resolve(root, 'src'), onDependency() {} })
assert.match(textColorCompiler.build(['text-label']), /\.text-label\s*\{[^}]*color: var\(--color-label\)/, 'Keep the existing text-label color utility')
// Compile without any candidates as well. Custom CSS must still see every token.
const unusedCompiler = await compile(source, { base: resolve(root, 'src'), onDependency() {} })
const unusedCss = unusedCompiler.build([])
for (const token of tokens) {
  assert.ok(unusedCss.includes(`${token}:`), `Token unavailable to var() without a utility: ${token}`)
}
for (const alias of ['--space-4', '--line-height-normal', '--width-content-lg', '--shadow-focus']) {
  assert.ok(unusedCss.includes(`${alias}:`), `Missing CSS alias: ${alias}`)
}
assert.ok(css.includes('prefers-reduced-motion: reduce'), 'UI reduced-motion media query missing')
console.log(`Design tokens: ${tokens.length} theme variables and ${candidates.length} utility candidates compiled successfully.`)
