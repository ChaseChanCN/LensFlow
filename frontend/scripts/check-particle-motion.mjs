import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'

const html = await readFile(new URL('../public/lensflow-v24.html', import.meta.url), 'utf8')
const classSource = html.slice(html.indexOf('class LensFlowApp {'), html.lastIndexOf("window.addEventListener('DOMContentLoaded'"))
const callbacks = new Map()
let nextId = 0
let cancelled = 0
let rendered = 0
const App = runInNewContext(`${classSource}; LensFlowApp`, {
  window: { innerWidth: 800, innerHeight: 600 },
  requestAnimationFrame(callback) { callbacks.set(++nextId, callback); return nextId },
  cancelAnimationFrame(id) { callbacks.delete(id); cancelled++ },
})
// Exercise the real scheduling and resizing methods without a GPU or network.
const app = Object.assign(Object.create(App.prototype), {
  ready: true,
  reducedMotion: false,
  animationFrameId: null,
  startTime: Date.now(),
  aspect: 1,
  material: { uniforms: { uTime: { value: -1 }, uViewportHeight: { value: 0 } } },
  renderer: { render() { rendered++ }, setSize() {} },
  camera: { updateProjectionMatrix() {} },
  computeScrollProgress() {},
  updateAndRender() {},
  projectTextTargets() {},
})
app.animate()
assert.equal(callbacks.size, 1, 'Normal motion schedules one next frame')
app.setReducedMotion(true)
assert.equal(cancelled, 1, 'Enabling reduced motion cancels the queued frame')
assert.equal(callbacks.size, 0, 'Reduced motion leaves no continuous loop')
assert.equal(app.material.uniforms.uTime.value, 0, 'Shader time freezes for reduced motion')
const staticRenders = rendered
app.setReducedMotion(true)
assert.equal(rendered, staticRenders, 'Duplicate preference events must not add frames')
app.onResize()
assert.equal(rendered, staticRenders + 1, 'Static canvas must repaint after setSize clears it')
assert.equal(callbacks.size, 0, 'Resize must not restart a reduced-motion loop')
app.setReducedMotion(false)
assert.equal(callbacks.size, 1, 'Restoring normal motion restarts exactly one loop')
app.setReducedMotion(false)
assert.equal(callbacks.size, 1, 'Repeated normal preference must not duplicate the loop')
console.log('Particle motion: pause, resume, duplicate events, frozen shader, and static resize checks passed.')
