// Local-only production preview. Uses synthetic responses; never connects to the backend.
// Run from repository root: node frontend/scripts/serve-design-system-fixtures.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const user = { id: 7, email: 'preview@example.invalid', name: '预览摄影师', role: 'photographer', created_at: '2026-10-16T00:00:00Z' }
const booking = { id: 5, client_id: 2, photographer_id: null, shoot_type: '人像摄影', preferred_date: null, contact_info: '测试数据', note: null, location: null, duration_hours: null, status: 'pending', created_at: '2026-10-16T08:00:00Z', updated_at: '' }
const order = { id: 1, booking_id: 5, client_id: 2, photographer_id: 7, status: 'CONFIRMED', created_at: '2026-10-16T08:00:00Z', updated_at: '', archived_at: null }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' }
const versions = [[resolve('frontend/dist'), 4186]]
if (existsSync('.agentwork/design-system/p3-before/dist')) versions.unshift([resolve('.agentwork/design-system/p3-before/dist'), 4185])
for (const [directory, port] of versions) {
  createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`)
      const state = req.headers.cookie?.match(/lensflow-fixture=(\w+)/)?.[1] ?? 'empty'
      if (url.pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Cache-Control', 'no-store')
        if (state === 'error' || (url.pathname.endsWith('/login') && state !== 'populated')) {
          res.writeHead(url.pathname.endsWith('/login') ? 401 : 503).end(JSON.stringify({ message: '预览：请求失败，请重试' })); return
        }
        if (url.pathname.endsWith('/login')) { res.end(JSON.stringify({ access_token: 'local-preview-only', token_type: 'bearer', user })); return }
        if (url.pathname.endsWith('/confirm')) { res.end(JSON.stringify({ ...booking, status: 'confirmed' })); return }
        const populated = state === 'populated'
        const response = url.pathname.endsWith('/me') ? user : /\/bookings\/\d+$/.test(url.pathname) ? booking : /\/orders\/\d+$/.test(url.pathname) ? order : url.pathname.endsWith('/bookings') ? (populated ? [booking] : []) : url.pathname.endsWith('/orders') ? (populated ? [order] : []) : []
        res.end(JSON.stringify(response)); return
      }
      const file = resolve(directory, '.' + decodeURIComponent(url.pathname))
      if (file !== directory && !file.startsWith(directory + sep)) { res.writeHead(403).end(); return }
      const path = extname(file) && existsSync(file) ? file : resolve(directory, 'index.html')
      let body = await readFile(path)
      if (extname(path) === '.js') body = Buffer.from(body.toString().replaceAll('http://localhost:8000', ''))
      if (extname(path) === '.html' && !url.pathname.endsWith('lensflow-v24.html')) {
        const fixture = ['empty', 'populated', 'error'].includes(url.searchParams.get('fixture')) ? url.searchParams.get('fixture') : state
        res.setHeader('Set-Cookie', `lensflow-fixture=${fixture}; Path=/; SameSite=Strict; HttpOnly`)
        const auth = url.pathname === '/login' || url.pathname === '/register' ? "localStorage.removeItem('access_token');localStorage.removeItem('user')" : `localStorage.setItem('access_token','local-preview-only');localStorage.setItem('user',${JSON.stringify(JSON.stringify(user))})`
        body = Buffer.from(body.toString().replace('<head>', `<head><script>${auth}</script>`))
      }
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' }).end(body)
    } catch { res.writeHead(500).end('Local fixture preview failed') }
  }).listen(port, '127.0.0.1', () => console.log(`Fixture preview: http://127.0.0.1:${port}/dashboard?fixture=empty`))
}
