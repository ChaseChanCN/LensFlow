import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),relative='docs/design-handoff/ds-01',out=path.join(root,relative),evidence=path.join(out,'evidence');
fs.mkdirSync(evidence,{recursive:true});
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const read=file=>fs.readFileSync(file,'utf8');
const save=(name,data)=>fs.writeFileSync(path.join(evidence,name),JSON.stringify(data,null,2)+'\n');
const requirements=['README.md','01-source-audit.md','02-visual-principles.md','03-token-reference.md','04-component-specification.md','05-mobile-screen-guidelines.md','06-platform-mapping.md','07-reference-index.md','08-design-drift.md','09-codearts-integration-guide.md','10-acceptance-checklist.md','tokens/lensflow-design-tokens.json'];
const errors=[],warnings=[];
for(const file of requirements){if(!fs.existsSync(path.join(out,file)))errors.push(`缺少文件：${file}`);else if(fs.statSync(path.join(out,file)).size<500)errors.push(`文档内容过少：${file}`);}
const tokens=JSON.parse(read(path.join(out,'tokens/lensflow-design-tokens.json')));
const verified=[...tokens.web.declarations,...tokens.web.metrics],all=[...verified,...tokens.mobileProposals,...tokens.unresolved],ids=new Set();
for(const t of all){
  if(ids.has(t.id))errors.push(`重复token：${t.id}`);ids.add(t.id);
  for(const key of ['value','unit','meaning','source','evidence'])if(!(key in t))errors.push(`缺字段：${t.id}.${key}`);
  if(t.value===null&&t.evidence!=='UNRESOLVED')errors.push(`非未决空值：${t.id}`);
}
for(const t of verified){
  if(t.evidence!=='VERIFIED_SOURCE'||!t.source.length)errors.push(`无可靠来源：${t.id}`);
  for(const s of t.source){
    const file=path.join(root,s.file);if(!fs.existsSync(file)){errors.push(`来源不存在：${s.file}`);continue;}
    const lines=read(file).split(/\r?\n/);
    if(s.lineStart<1||s.lineEnd<s.lineStart||s.lineEnd>lines.length)errors.push(`行号越界：${t.id}`);
    if(!lines.slice(s.lineStart-1,s.lineEnd).join('\n').includes(s.excerpt))errors.push(`来源原文不匹配：${t.id}`);
    if(sha(file)!==s.sha256)errors.push(`来源哈希漂移：${s.file}`);
  }
}
for(const theme of ['dark','light']){
  const map=tokens.web.effectiveThemes[theme];
  const resolve=(value,stack=[])=>value.replace(/var\((--[\w-]+)\)/g,(_,key)=>{
    if(stack.includes(key)||!map[key])throw Error(`别名循环／丢失：${theme}/${key}`);
    return resolve(map[key].value,[...stack,key]);
  });
  for(const [name,t]of Object.entries(map)){
    if(!ids.has(t.originId))errors.push(`originId不存在：${theme}/${name}`);
    try{if(resolve(t.value,[name])!==t.resolvedValue)errors.push(`别名解析值不匹配：${theme}/${name}`);}catch(e){errors.push(e.message);}
  }
}
for(const t of tokens.mobileProposals){if(t.evidence!=='PROPOSED_ADAPTATION'||!t.rationale||!t.basis?.length)errors.push(`未明确标记建议：${t.id}`);for(const id of t.basis??[])if(!ids.has(id))errors.push(`建议依据不存在：${t.id}→${id}`);}
const docs=fs.readdirSync(out).filter(f=>f.endsWith('.md')),pendingLinks=[];
let linkCount=0,sourceMentionCount=0;
for(const name of docs){
  const text=read(path.join(out,name));
  for(const match of text.matchAll(/!?\[[^\]]*\]\(([^\n)]+)\)/g)){
    let target=match[1].replace(/^<|>$/g,'').split(/\s+"/)[0];
    if(/^(https?:|mailto:|codex:|#)/.test(target))continue;
    target=decodeURIComponent(target.split('#')[0]);linkCount++;
    pendingLinks.push({name,target});
  }
  for(const m of text.matchAll(/(frontend\/[A-Za-z0-9_.\/-]+\.(?:css|tsx|ts|json)):(\d+)(?:[-–](\d+))?/g)){
    sourceMentionCount++;const file=path.join(root,m[1]);
    if(!fs.existsSync(file)){errors.push(`文档来源不存在：${name}→${m[1]}`);continue;}
    const lineCount=read(file).split(/\r?\n/).length,end=Number(m[3]??m[2]);
    if(Number(m[2])<1||end>lineCount||end<Number(m[2]))errors.push(`文档来源行号无效：${name}→${m[0]}`);
  }
}
const refs=[
['01-home-dark.jpg','/','dark','品牌hero可见区域',['frontend/src/pages/LandingPage.tsx','frontend/src/components/material/ParticlePortrait.tsx']],
['02-home-light.jpg','/','light','浅色hero可见区域',['frontend/src/pages/LandingPage.tsx','frontend/src/components/material/ParticlePortrait.tsx']],
['03-login-light.jpg','/login','light','演示填写表单，右侧局部',['frontend/src/pages/auth/LoginPage.tsx','frontend/src/components/ui/Input.tsx','frontend/src/components/ui/Button.tsx']],
['04-dashboard-light.jpg','/dashboard','light','工作台统计及预约局部',['frontend/src/pages/photographer/DashboardPage.tsx']],
['05-dashboard-dark.jpg','/dashboard','dark','工作台标题与统计局部',['frontend/src/pages/photographer/DashboardPage.tsx']],
['06-library-dark.jpg','/orders/91001/library','dark','图库滚动到照片区',['frontend/src/pages/photographer/PhotoLibraryPage.tsx','frontend/src/components/photo-library/AssetGrid.tsx']],
['07-viewer-dark.jpg','/orders/91001/library','dark','PhotoViewer覆盖层',['frontend/src/components/photo-library/PhotoViewer.tsx','frontend/src/components/ui/Modal.tsx']],
['08-booking-dark.jpg','/booking','dark','桌面预约字段',['frontend/src/pages/client/BookingPage.tsx']],
['09-client-dark.jpg','/client','dark','客户快捷入口与预约',['frontend/src/pages/client/ClientPage.tsx']],
['10-client-light.jpg','/client','light','客户快捷入口与预约',['frontend/src/pages/client/ClientPage.tsx']],
['11-selection-light.jpg','/orders/91001/selection','light','已选1/3的编号卡片，无照片节点',['frontend/src/pages/client/SelectionPage.tsx']],
['12-delivery-empty-light.jpg','/orders/91001/delivery','light','演示交付404后的真实空态',['frontend/src/pages/client/DeliveryPage.tsx']],
['13-booking-mobile-dark.jpg','/booking','dark','手机纵向字段',['frontend/src/pages/client/BookingPage.tsx']],
['14-home-mobile-light.jpg','/','light','手机上图下文',['frontend/src/pages/LandingPage.tsx','frontend/src/components/material/ParticlePortrait.tsx']],
];
function jpegSize(bytes){
  if(bytes[0]!==255||bytes[1]!==216)throw Error('不是JPEG');
  let offset=2;
  while(offset<bytes.length){
    if(bytes[offset++]!==255)continue;
    while(bytes[offset]===255)offset++;
    const marker=bytes[offset++];
    if(marker===0xd9||marker===0xda)break;
    if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
    const length=bytes.readUInt16BE(offset);
    if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker))return {width:bytes.readUInt16BE(offset+5),height:bytes.readUInt16BE(offset+3)};
    offset+=length;
  }throw Error('未找到JPEG尺寸');
}
const captures=[];
for(const [file,page,theme,state,sources] of refs){
  const p=path.join(out,'references',file);if(!fs.existsSync(p)){errors.push(`缺截图：${file}`);continue;}
  const bytes=fs.readFileSync(p),mobile=file.startsWith('13-')||file.startsWith('14-');
  let imageSize;try{imageSize=jpegSize(bytes);}catch{errors.push(`无效JPEG：${file}`);continue;}
  captures.push({file:'references/'+file,page,theme,state,cssViewport:mobile?{width:375,height:812}:{width:1280,height:720},imageSize,imageFormat:'JPEG',sha256:sha(p),savedAt:fs.statSync(p).mtime.toISOString(),evidence:'VERIFIED_RENDER',captureMethod:'CUA IAB实际页面截图，工具返回原始JPEG字节，未加工；扩展名已按文件签名更名，返回可见区域与CSS视口不等，存在缩放／截断。',build:{mode:'development',vite:'8.3.4',baseHead:tokens.repositoryHead,workingTree:'包含开始前既有改动及并发工作区更新；不是不可变生产构建。'},sources});
}
save('reference-captures.json',{captureDate:'2026-10-18',completedDate:'2026-10-19',limitations:['桌面JPEG不覆盖完整CSS宽度；不得按图像像素反推CSS尺寸。','手机是Web浏览器viewport覆盖，不是微信实机。','并发更新记录在repository-verification.json；源码指纹在source-snapshot.json。'],captures});
const sourcePaths=[...new Set([...verified.flatMap(t=>t.source.map(s=>s.file)),...captures.flatMap(c=>c.sources),
'frontend/src/main.tsx','frontend/src/App.tsx','frontend/package.json','frontend/vite.config.ts','frontend/src/components/material/MaterialScope.tsx','frontend/src/components/material/MaterialTheme.ts','frontend/src/components/material/PublicShell.tsx','frontend/src/components/Layout.tsx','frontend/src/components/ui/Badge.tsx','frontend/src/components/ui/Card.tsx','frontend/src/components/ui/ListItem.tsx','frontend/src/components/ui/ListGroup.tsx','frontend/src/components/ui/LargeTitle.tsx','frontend/src/components/ui/PageState.tsx','frontend/src/components/ui/EmptyState.tsx','frontend/src/components/ui/Spinner.tsx','frontend/src/components/ui/modalManager.ts','frontend/src/components/effects/EffectSurfaces.tsx','frontend/src/components/effects/QuickActions.tsx','frontend/src/components/effects/presets.ts','frontend/src/components/effects/useEffectMotion.ts','frontend/src/components/effects/effects.css','frontend/src/components/effects/card-cursor-glow.css','frontend/src/pages/auth/RegisterPage.tsx','frontend/src/pages/photographer/OrdersPage.tsx','frontend/src/pages/photographer/OrderDetailPage.tsx','frontend/src/pages/photographer/LightTablePage.tsx','frontend/src/pages/photographer/UploadPage.tsx','frontend/src/components/photo-library/AssetThumbnail.tsx','frontend/src/components/photo-library/MetadataTools.tsx','frontend/src/components/photo-library/KeywordTools.tsx','frontend/src/components/photo-library/MetadataDetails.tsx','frontend/src/components/photo-library/DescriptiveMetadata.tsx','frontend/src/components/photo-editor/PhotoViewport.tsx','frontend/src/components/photo-editor/PhotoWorkbench.tsx','frontend/src/components/photo-editor/DraftStatus.tsx','frontend/src/api/deliveries.ts','frontend/src/api/selections.ts','frontend/src/api/photoCatalog.ts','frontend/src/api/imageEdit.ts','frontend/src/stores/auth.ts','backend/tests/fixtures/README.md','backend/tests/fixtures/grace_hopper.jpg','docs/design-system.md','docs/design-tokens.md','docs/design-system-phase-5.md','docs/material-ui-site-rollout.md'])];
const baseline=JSON.parse(read(path.join(evidence,'repository-baseline.json')));
save('source-snapshot.json',{collectedAt:new Date().toISOString(),note:'交付核验时的相关来源指纹；当前文件若与开始基线不同会明确列出。不是截图时源码不可变快照，也不记录凭据。',files:sourcePaths.sort().map(file=>({file,sha256:sha(path.join(root,file)),lineCount:file.endsWith('.jpg')?null:read(path.join(root,file)).split(/\r?\n/).length,changedSinceStart:baseline.hashes[file]!==sha(path.join(root,file))}))});
function rgb(hex){let h=hex.slice(1);if(h.length===3)h=[...h].map(c=>c+c).join('');if(!/^[0-9a-f]{6}$/i.test(h))throw Error(`仅接受不透明hex：${hex}`);return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)/255);}
function luminance(hex){return rgb(hex).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);}
function ratio(a,b){const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);}
const contrast=[];
for(const mode of ['light','dark']){
  const t=tokens.web.effectiveThemes[mode],v=name=>t[name].resolvedValue;
  for(const [label,fg,bg]of [['主文/页面','--mat-text','--mat-page'],['主文/面板','--mat-text','--mat-panel'],['次文/页面','--mat-muted','--mat-page'],['次文/面板','--mat-muted','--mat-panel'],['主按钮','--mat-button-text','--mat-control'],['主按钮hover','--mat-button-text','--mat-button-hover'],['强调链接/页面','--mat-accent','--mat-page'],...['success','warning','error','info'].map(x=>[x+'状态',`--color-${x}-label`,`--color-${x}-bg`])]){
    const r=ratio(v(fg),v(bg));contrast.push({theme:mode,label,foreground:v(fg),background:v(bg),foregroundToken:fg,backgroundToken:bg,ratio:r,normalTextThreshold:4.5,pass:r>=4.5,evidence:'VERIFIED_SOURCE',method:'本轮按WCAG相对亮度公式计算静态不透明token配对；不是全页面无障碍验收。'});
  }
}
const historicalComparisons=[['基础操作蓝配白字','#FFFFFF','#007AFF'],['基础品牌蓝灰配白字','#FFFFFF','#6B7A99']].map(([label,foreground,background])=>({label,foreground,background,ratio:ratio(foreground,background),normalTextThreshold:4.5,pass:ratio(foreground,background)>=4.5,scope:'基础字典比较，不是当前Material filled按钮。'}));
save('contrast-results.json',{computedAt:new Date().toISOString(),formulaSource:'https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html',scope:'22组当前Material不透明配对，2组基础参考对比；不覆盖所有hover/pressed、透明复合、shader、禁用或原生微信控件。',currentPairs:contrast,baseReferencePairs:historicalComparisons,currentPassed:contrast.filter(r=>r.pass).length,currentTotal:contrast.length});
for(const {name,target} of pendingLinks)if(target!=='evidence/validation-results.json'&&!fs.existsSync(path.resolve(out,target)))errors.push(`链接不存在：${name}→${target}`);
for(const item of contrast.filter(r=>!r.pass))warnings.push(`静态配对不足4.5：${item.theme}/${item.label}=${item.ratio}`);
const scanFiles=[...docs.map(f=>path.join(out,f)),path.join(out,'tokens/lensflow-design-tokens.json'),...fs.readdirSync(path.join(out,'tools')).filter(f=>f.endsWith('.mjs')||f.endsWith('.py')).map(f=>path.join(out,'tools',f)),...fs.readdirSync(evidence).filter(f=>f.endsWith('.json')&&f!=='validation-results.json').map(f=>path.join(evidence,f))];
const privacyHits=[];
for(const file of scanFiles){const content=read(file);for(const [label,re] of [['疑似真实私钥',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],['疑似JWT',/\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\b/g],['疑似带凭据数据库URL',/postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/g],['疑似签名媒体URL',/https?:\/\/[^\s)"<>]+[?&](?:token|signature|X-Amz-Signature)=[^\s)"<>]+/gi]])if(re.test(content))privacyHits.push({file:path.relative(out,file).replaceAll('\\','/'),label});}
if(privacyHits.length)errors.push('文本隐私扫描发现需人工复核的敏感模式。');
const protectionPath=path.join(evidence,'repository-verification.json');
const protection=fs.existsSync(protectionPath)?JSON.parse(read(protectionPath)):null;
if(!protection?.pass)warnings.push('全仓库开始/结束比较不是通过：检测到并发工作区更新；不可重置或覆盖。详见repository-verification.json。');
const result={checkedAt:new Date().toISOString(),auditStartedDate:'2026-10-18',completedDate:'2026-10-19',pass:errors.length===0,requiredFiles:requirements.length,markdownFiles:docs.length,verifiedTokenCount:verified.length,variableDeclarationCount:tokens.web.declarations.length,componentMetricCount:tokens.web.metrics.length,proposedMobileTokenCount:tokens.mobileProposals.length,unresolvedTokenCount:tokens.unresolved.length,uniqueTokenIds:ids.size,localLinksChecked:linkCount,explicitSourceMentionsChecked:sourceMentionCount,sourceHashesVerified:true,screenshots:captures.length,screenshotSignaturesVerified:true,textPrivacyScan:{files:scanFiles.length,hits:privacyHits,limitation:'静态模式扫描加人工截图查看，不构成全仓库隐私审计。'},currentContrastPairs:{passed:contrast.filter(r=>r.pass).length,total:contrast.length},repositoryBaselineComparisonPassed:protection?.pass??null,repositoryProtectionNote:'DS-01全部有意文件写入局限本输出目录；比较结果不归因文件作者。并发变化如实保留。',backendTestsRun:false,databaseMigrationsRun:false,miniProgramImplementationCreated:false,errors,warnings};
save('validation-results.json',result);console.log(JSON.stringify(result,null,2));if(errors.length)process.exitCode=1;
