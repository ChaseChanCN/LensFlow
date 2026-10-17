// Real backend proxy; no synthetic API responses or injected authentication.
// Build first, start backend/scripts/run_design_system_acceptance.py, then run from root.
import { createServer, request } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

const types = { '.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.bin':'application/octet-stream' }
const versions=[[resolve('frontend/dist'),4206]]
if(existsSync('.agentwork/design-system/p5-before/dist'))versions.unshift([resolve('.agentwork/design-system/p5-before/dist'),4205])
for(const [directory,port] of versions)createServer(async(req,res)=>{
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`)
    if(url.pathname.startsWith('/api/') || url.pathname === '/health') {
      const upstream=request({hostname:'127.0.0.1',port:8008,path:req.url,method:req.method,headers:{...req.headers,host:'127.0.0.1:8008'}},response=>{
        res.writeHead(response.statusCode,response.headers);response.pipe(res)
      })
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'application/json'});res.end(JSON.stringify({message:'Acceptance backend unavailable'}))})
      req.pipe(upstream);return
    }
    const file=resolve(directory,'.'+decodeURIComponent(url.pathname))
    if(file!==directory&&!file.startsWith(directory+sep)){res.writeHead(403).end();return}
    const path=extname(file)&&existsSync(file)?file:resolve(directory,'index.html')
    let content=await readFile(path)
    // Normalize the developer's localhost API base only in the served benchmark copy.
    if(extname(path)==='.js')content=Buffer.from(content.toString().replaceAll('http://localhost:8000',''))
    res.writeHead(200,{'Content-Type':types[extname(path)]??'application/octet-stream','Cache-Control':'no-store'}).end(content)
  } catch {res.writeHead(500).end('Acceptance preview failed')}
}).listen(port,'127.0.0.1',()=>console.log(`Real backend acceptance: http://127.0.0.1:${port}`))
