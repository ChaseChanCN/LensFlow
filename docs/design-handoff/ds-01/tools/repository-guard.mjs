import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=process.cwd();
const output='docs/design-handoff/ds-01/';
const dir=path.join(root,output,'evidence');
fs.mkdirSync(dir,{recursive:true});
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:32*1024*1024}).trimEnd();
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
function snapshot(){
  const files=git('ls-files','-c','-o','--exclude-standard','-z').split('\0').filter(p=>p&&!p.startsWith(output));
  const hashes={};
  for(const p of [...new Set(files)].sort()) if(fs.existsSync(path.join(root,p))&&fs.statSync(path.join(root,p)).isFile()) hashes[p]=hash(p);
  return {capturedAt:new Date().toISOString(),head:git('rev-parse','HEAD'),branch:git('branch','--show-current'),status:git('status','--porcelain=v1','--untracked-files=all').split('\n').filter(x=>x&&!x.includes(output)),hashes};
}
const mode=process.argv[2];
if(mode==='baseline'){
  const target=path.join(dir,'repository-baseline.json');
  if(fs.existsSync(target)) throw Error('基线已存在，不可覆盖');
  const data=snapshot();fs.writeFileSync(target,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({mode,head:data.head,branch:data.branch,protectedFiles:Object.keys(data.hashes).length,statusEntries:data.status.length}));
}else if(mode==='verify'){
  const before=JSON.parse(fs.readFileSync(path.join(dir,'repository-baseline.json'),'utf8'));
  const after=snapshot();
  const changed=Object.keys(before.hashes).filter(p=>after.hashes[p]!==before.hashes[p]);
  const added=Object.keys(after.hashes).filter(p=>!(p in before.hashes));
  const result={capturedAt:after.capturedAt,headUnchanged:before.head===after.head,branchUnchanged:before.branch===after.branch,statusUnchanged:JSON.stringify(before.status)===JSON.stringify(after.status),protectedFiles:Object.keys(before.hashes).length,changedOutsideOutput:changed,addedOutsideOutput:added,pass:changed.length===0&&added.length===0&&before.head===after.head&&before.branch===after.branch&&JSON.stringify(before.status)===JSON.stringify(after.status),scope:'Git 跟踪文件及未忽略的未跟踪文件；不将忽略目录和数据库内容纳入字节证明。DS-01 未启动或调用后端。'};
  fs.writeFileSync(path.join(dir,'repository-verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  if(!result.pass) process.exitCode=1;
}else throw Error('用法：node docs/design-handoff/ds-01/tools/repository-guard.mjs baseline|verify');
