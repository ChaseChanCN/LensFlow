// Local-only, synthetic production preview. Never forwards requests to the backend.
// From repository root: node frontend/scripts/serve-phase-4-fixtures.mjs
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'

const date = '2026-10-16T08:00:00Z'
const booking = { id: 5, client_id: 2, photographer_id: null, shoot_type: 'portrait', preferred_date: '2026-10-20', contact_info: 'preview@example.invalid', note: '自然光人像', location: '摄影棚', duration_hours: 2, status: 'pending', created_at: date, updated_at: date }
const order = { id: 1, booking_id: 5, client_id: 2, photographer_id: 7, status: 'WAITING_UPLOAD', created_at: date, updated_at: date, archived_at: null }
const photo = { id: 10, order_id: 1, filename: 'portrait.jpg', storage_key: 'synthetic/portrait.jpg', mime: 'image/jpeg', size_bytes: 102400, width: 640, height: 480, created_at: date, updated_at: date }
const analysis = { id: 3, photo_id: 10, sharpness_score: 150.5, brightness_mean: 128, highlight_ratio: 0.05, shadow_ratio: 0.03, suggestion: 'no_issue', risk_level: 'low', reviewed: false, reviewer_id: null, reviewed_at: null, final_decision: 'pending', created_at: date }
const delivery = { id: 9, order_id: 1, storage_key: 'synthetic/final.zip', filename: 'final.zip', delivered_at: date }
const task = { id: 6, order_id: 1, photo_id: 10, status: 'pending', due_date: null, created_at: date }
const selection = { id: 4, order_id: 1, max_select: 2, expires_at: null, published_at: date, created_at: date, items: [10,11,12].map((photo_id,id)=>({id,selection_set_id:4,photo_id})) }
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.bin': 'application/octet-stream' }
const sessions = new Map()
function seed(state='populated', role='photographer', status='WAITING_UPLOAD') {
  const populated=state==='populated'
  return { state, user:{id:role==='client'?2:7,email:'preview@example.invalid',name:'本地预览',role,created_at:date}, booking:{...booking}, order:{...order,status}, bookings:populated?[{...booking}]:[], photos:populated?[{...photo}]:[], analysis:{...analysis}, delivery:populated?{...delivery}:null, tasks:populated?[{...task}]:[], versions:populated?[{id:1,retouch_task_id:6,storage_key:'synthetic/preview.jpg',version_no:1,uploaded_at:date}]:[], feedback:[], selection:{...selection,items:populated?selection.items:[]} }
}
const versions=[[resolve('frontend/dist'),4196]]
if(existsSync('.agentwork/design-system/p4-before/dist'))versions.unshift([resolve('.agentwork/design-system/p4-before/dist'),4195])
for(const [directory,port] of versions)createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,`http://127.0.0.1:${port}`)
    let sid=req.headers.cookie?.match(/lensflow-p4=([\w-]+)/)?.[1]
    let session=sessions.get(sid)
    if(!session){sid=randomUUID();session=seed();sessions.set(sid,session)}
    const send=(value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}).end(JSON.stringify(value))}
    if(url.pathname.startsWith('/api/')) {
      if(session.state==='error')return send({message:'模拟请求失败，请重试'},503)
      const path=url.pathname
      const chunks=[];for await(const chunk of req)chunks.push(chunk)
      const raw=Buffer.concat(chunks).toString(); const body=req.headers['content-type']?.includes('application/json')&&raw?JSON.parse(raw):{}
      if(/\/(login|register)$/.test(path))return send({access_token:'local-preview-only',token_type:'bearer',user:session.user})
      if(path.endsWith('/me'))return send(session.user)
      if(path.endsWith('/bookings')) {if(req.method==='POST'){session.booking={...session.booking,...body};session.bookings.push(session.booking);return send(session.booking)}return send(session.bookings)}
      if(/\/bookings\/\d+\/cancel$/.test(path)){session.booking.status='cancelled';session.bookings=session.bookings.map(b=>({...b,status:'cancelled'}));return send(session.booking)}
      if(/\/bookings\/\d+\/confirm$/.test(path)){session.booking.status='confirmed';session.bookings=session.bookings.map(b=>({...b,status:'confirmed'}));return send(session.booking)}
      if(/\/bookings\/\d+$/.test(path)){if(req.method==='PATCH')Object.assign(session.booking,body);return send(session.booking)}
      if(path.endsWith('/orders'))return send(session.state==='populated'?[session.order]:[])
      if(path.endsWith('/timeline'))return send([])
      if(path.endsWith('/status')){session.order.status=body.target_status;return send(session.order)}
      if(/\/orders\/\d+$/.test(path))return send(session.order)
      if(path.endsWith('/photos')){if(req.method==='POST'){session.photos.push({...photo,id:11,filename:'uploaded-preview.jpg'});return send({photo:session.photos.at(-1),analysis_triggered:true})}return send(session.photos)}
      if(/\/photos\/\d+$/.test(path)&&req.method==='DELETE'){const id=Number(path.split('/').at(-1));session.photos=session.photos.filter(p=>p.id!==id);return send(null)}
      if(path.endsWith('/analysis'))return send(session.analysis)
      if(path.endsWith('/review')){Object.assign(session.analysis,body,{reviewed:true});return send(session.analysis)}
      if(path.endsWith('/selection-set'))return send(session.selection)
      if(path.endsWith('/submit'))return send({id:1,selection_set_id:4,selected_photo_ids:JSON.stringify(body.selected_photo_ids),submitted_at:date})
      if(path.endsWith('/delivery')){if(req.method==='POST'){session.delivery={...delivery};session.order.status='DELIVERED'}return session.delivery?send(session.delivery):send({message:'尚未交付'},404)}
      if(path.endsWith('/archive')){session.order.status='ARCHIVED';return send(session.delivery)}
      if(path.endsWith('/retouch-tasks'))return send(session.tasks)
      if(path.endsWith('/versions')){if(req.method==='POST')session.versions.push({id:2,retouch_task_id:6,storage_key:'synthetic/upload.jpg',version_no:2,uploaded_at:date});return send(req.method==='POST'?session.versions.at(-1):session.versions)}
      if(path.endsWith('/feedback')){if(req.method==='POST')session.feedback.push({id:1,retouch_task_id:6,version_id:null,content:body.content,author_id:2,created_at:date});return send(req.method==='POST'?session.feedback.at(-1):session.feedback)}
      if(path.endsWith('/confirm-retouch')){session.tasks=session.tasks.map(t=>({...t,status:'confirmed'}));return send(session.tasks[0])}
      if(path.endsWith('/download')){res.writeHead(200,{'Content-Type':'text/plain','Content-Disposition':'attachment; filename="synthetic-delivery.txt"'}).end('Synthetic fixture only; no customer photos.');return}
      return send({message:'Unknown fixture endpoint'},404)
    }
    const file=resolve(directory,'.'+decodeURIComponent(url.pathname));if(file!==directory&&!file.startsWith(directory+sep)){res.writeHead(403).end();return}
    const path=extname(file)&&existsSync(file)?file:resolve(directory,'index.html');let content=await readFile(path)
    if(extname(path)==='.js')content=Buffer.from(content.toString().replaceAll('http://localhost:8000',''))
    if(extname(path)==='.html'&&!url.pathname.endsWith('lensflow-v24.html')) {
      if(url.searchParams.has('fixture')||url.searchParams.has('role')||url.searchParams.has('status')) {
        const state=['empty','populated','error'].includes(url.searchParams.get('fixture'))?url.searchParams.get('fixture'):'populated'
        const role=url.searchParams.get('role')==='client'?'client':'photographer'
        session=seed(state,role,url.searchParams.get('status')??(url.pathname.endsWith('/delivery')?'DELIVERED':'WAITING_UPLOAD'));sessions.set(sid,session)
      }
      res.setHeader('Set-Cookie',`lensflow-p4=${sid}; Path=/; SameSite=Strict; HttpOnly`)
      const auth=['/login','/register'].includes(url.pathname)?"localStorage.removeItem('access_token');localStorage.removeItem('user')":`localStorage.setItem('access_token','local-preview-only');localStorage.setItem('user',${JSON.stringify(JSON.stringify(session.user))})`
      content=Buffer.from(content.toString().replace('<head>',`<head><script>${auth}</script>`))
    }
    res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-store'}).end(content)
  } catch {res.writeHead(500).end('Local synthetic preview failed')}
}).listen(port,'127.0.0.1',()=>console.log(`P4 fixture preview: http://127.0.0.1:${port}/client?fixture=populated&role=client`))
