import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import react from '../../../../frontend/node_modules/@vitejs/plugin-react/dist/index.js';
import tailwindcss from '../../../../frontend/node_modules/@tailwindcss/vite/dist/index.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../../..');
const fixture=path.join(repo,'backend/tests/fixtures/grace_hopper.jpg');
const out=path.resolve(here,'..');
const date='2026-10-18T00:00:00Z';
const order={id:91001,booking_id:92001,client_id:93002,photographer_id:93001,status:'WAITING_SELECTION',created_at:date,updated_at:date,archived_at:null};
const bookings=[{id:92001,client_id:93002,photographer_id:null,shoot_type:'portrait',preferred_date:null,contact_info:'演示夹具，无真实联系方式',location:'演示场地',duration_hours:null,note:'仅供 DS-01 视觉核验',status:'pending',created_at:date,updated_at:date}];
const assets=Array.from({length:6},(_,i)=>({id:94001+i,order_id:91001,filename:`公开测试照片-${i+1}.jpg`,mime:'image/jpeg',width:517,height:606,size_bytes:73746,created_at:date}));
const counts={total:6,indexed:0,pending:6,unindexed:6,failed:0,unsupported:0,active:0,generation:'ds01',parser_version:'ds01'};
const requests=[];
function saveLog(){fs.mkdirSync(path.join(out,'evidence'),{recursive:true});fs.writeFileSync(path.join(out,'evidence/preview-requests.json'),JSON.stringify({说明:'独立 Vite 内存夹具，无代理，无后端；不记录登录请求正文。',requests},null,2)+'\n');}
function auditFixtures(){return {name:'ds01-isolated-fixtures',configureServer(server){server.middlewares.use((req,res,next)=>{
  const url=new URL(req.url,'http://127.0.0.1:5197');const p=url.pathname;
  if(!p.startsWith('/api/'))return next();
  requests.push({method:req.method,path:p});saveLog();
  const json=(data,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('X-DS01-Fixture','true');res.end(JSON.stringify(data));};
  if(req.method==='POST'&&p==='/api/v1/auth/login'){
    let body='';req.on('data',c=>body+=c);req.on('end',()=>{let email='';try{email=JSON.parse(body).email??'';}catch{}const role=email==='client@example.invalid'?'client':'photographer';json({access_token:'ds01-local-fixture-only',token_type:'bearer',user:{id:role==='client'?93002:93001,name:'DS-01 演示账号',email:'demo@example.invalid',role}});});return;
  }
  if(req.method!=='GET')return json({code:'DS01_READ_ONLY',message:'DS-01 隔离预览不执行业务写入'},405);
  if(p==='/api/v1/bookings')return json(bookings);
  if(p==='/api/v1/orders')return json([order]);
  if(p==='/api/v1/orders/91001')return json(order);
  if(p==='/api/v1/orders/91001/timeline')return json([]);
  if(p==='/api/v1/orders/91001/selection-set')return json({id:95001,order_id:91001,max_select:3,expires_at:null,published_at:date,created_at:date,revision:0,draft_selected_photo_ids:[94001],submitted:false,items:assets.map((a,i)=>({id:96001+i,selection_set_id:95001,photo_id:a.id}))});
  if(p==='/api/v1/orders/91001/photos/catalog')return json({items:assets,has_more:false,next_cursor:null});
  if(p.endsWith('/metadata-index/status'))return json(counts);
  if(p.endsWith('/photos/metadata-facets'))return json({camera_make:[],camera_model:[],lens_make:[],lens_model:[],truncated:false,counts});
  if(p.endsWith('/photos/timeline'))return json({level:'year',buckets:[],unknown:6,matched:6,truncated:false,counts});
  if(p.endsWith('/metadata-index/issues'))return json({items:[],next_cursor:null});
  if(p.endsWith('/keyword-index/status'))return json({total:6,indexed:0,unknown:6});
  if(/^\/api\/v1\/photos\/9400[1-6]\/(thumbnail|preview)$/.test(p)){
    res.setHeader('Content-Type','image/jpeg');res.setHeader('X-DS01-Fixture','true');fs.createReadStream(fixture).pipe(res);return;
  }
  if(p.endsWith('/delivery'))return json({code:'NOT_FOUND',message:'演示环境暂无交付'},404);
  return json({code:'DS01_UNAVAILABLE',message:'DS-01 未提供此接口夹具'},503);
});}};}
export default {
  root:path.join(repo,'frontend'),envDir:path.join(out,'preview-env'),cacheDir:path.join(out,'.preview-cache'),
  plugins:[auditFixtures(),react(),tailwindcss()],
  define:{'import.meta.env.VITE_API_BASE_URL':JSON.stringify('')},
  resolve:{alias:{'@':path.join(repo,'frontend/src')}},
  server:{host:'127.0.0.1',port:5197,strictPort:true,proxy:{},fs:{allow:[repo]},watch:{ignored:['**/docs/design-handoff/**']}},
};
