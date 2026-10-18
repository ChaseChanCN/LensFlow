import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=process.cwd(),out=path.join(root,'docs/design-handoff/ds-01');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const baseFile='frontend/src/index.css',matFile='frontend/src/components/material/material.css';
const meanings={
  'font-sans':'界面系统无衬线字体栈；中文依赖系统回退','font-mono':'编号与英文眉题等宽字体栈','font-numeric':'数字展示字体栈',
  'color-brand-primary':'基础品牌装饰蓝灰，不等同当前主题主按钮底色','color-action-primary':'保留的基础操作蓝；不代表 Material filled 按钮当前底色','color-action-primary-strong':'基础高对比操作色，在 Material 内映射到主题强调色',
  'color-label':'主文字','color-label-muted':'次文字','color-label-secondary':'次级文字','color-label-tertiary':'三级文字，不可默认承载必读信息','color-label-quaternary':'最弱文字层级','color-label-inverse':'反色文字，Material 中映射到页面底色',
  'color-surface-primary':'主表面','color-surface-secondary':'次表面／页面层','color-surface-tertiary':'三级表面','color-surface-grouped':'分组页面底色','color-surface-neutral':'基础中性图片表面；图库实际图像区另用 #323232','color-surface-neutral-dark':'历史命名的灰色中性表面，数值不代表实际深色画布',
  'shadow-card':'卡片阴影；Material 内明确清空','shadow-modal':'对话框叠层阴影','shadow-focus':'焦点环阴影','shadow-focused':'工具类兼容焦点阴影',
  'mat-page':'Material 页面底色','mat-panel':'Material 卡片和面板底色','mat-control':'Material 控件底色','mat-text':'Material 主文字','mat-muted':'Material 次文字','mat-line':'Material 分隔线','mat-border':'Material 面板边界','mat-accent':'Material 蓝灰强调色；当前链接与选片边界引用来源','mat-body':'Material 辅助正文','mat-field':'Material 字段标签','mat-placeholder':'Material 占位文字','mat-button-text':'Material 主按钮文字','mat-button-border':'Material 主按钮边框','mat-button-hover':'Material 主按钮悬停底色','mat-hover':'Material 卡片悬停底色','mat-hover-border':'Material 悬停边框','mat-numeric':'Material 统计数字','mat-nav-text':'Material 当前导航文字','mat-nav-active':'Material 当前导航底色','mat-nav-border':'Material 当前导航边框','mat-focus':'Material 焦点轮廓','mat-art':'Material 装饰线稿','mat-tag-border':'Material 标签边界','mat-metric':'Material 指标文字','mat-skeleton':'Material 骨架占位','mat-nav':'Material 半透明导航底色','mat-white':'Material 悬停文案色；浅色模式并非白色',
};
const parts={text:'字号',display:'展示',heading:'标题',body:'正文',caption:'辅助说明',form:'表单',label:'标签',numeric:'数字',xl:'特大',lg:'大',md:'中',sm:'小',weight:'字重',regular:'常规',medium:'中等',semibold:'半粗',bold:'粗',leading:'行高',tight:'紧凑',normal:'常规',relaxed:'宽松',color:'颜色',brand:'品牌',primary:'主',secondary:'次',tertiary:'三级',dark:'深色',inverse:'反色',success:'成功',warning:'警告',error:'错误',info:'信息',bg:'底色',border:'边界',hover:'悬停',pressed:'按下',fill:'填充',system:'系统',separator:'分隔线',opaque:'不透明',focus:'焦点',ring:'轮廓',spacing:'间距',space:'间距别名',container:'容器',content:'内容宽度',breakpoint:'响应式断点',radius:'圆角',control:'控件',card:'卡片',sheet:'浮层',full:'胶囊',shadow:'阴影',elevated:'抬升',width:'宽度',thin:'细',thick:'粗',duration:'动效时长',instant:'即时',fast:'快',base:'基础',slow:'慢',slower:'更慢',ease:'缓动',in:'进入',out:'离开',bounce:'回弹',z:'层级',dropdown:'下拉',sticky:'吸顶',fixed:'固定',modal:'对话框',backdrop:'遮罩',popover:'浮出层',tooltip:'提示',toast:'通知',line:'行',height:'高',action:'操作',accent:'兼容强调色',darkroom:'品牌暗房',overlay:'遮罩',neutral:'中性',quaternary:'四级',surface:'表面',grouped:'分组',strong:'增强'};
function meaning(name){const key=name.replace(/^--/,'');return meanings[key]??key.split('-').map(x=>parts[x]??x).join('／');}
function unit(value){if(/^[-.\d]+(px|rem|ms|s)$/.test(value))return value.match(/[a-z]+$/)[0];if(/^[-.\d]+$/.test(value))return 'unitless';return null;}
function block(file,marker,scope,selector){
  const text=read(file),start=text.indexOf(marker);if(start<0)throw Error(marker);
  const begin=text.indexOf('{',start),end=text.indexOf('}',begin),body=text.slice(begin+1,end),tokens=[];
  for(const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)){
    const offset=begin+1+match.index,line=text.slice(0,offset).split('\n').length;
    const name=match[1],value=match[2].trim();
    tokens.push({id:`${scope}/${name}`,name,scope,selector,value,unit:unit(value),meaning:meaning(name),evidence:'VERIFIED_SOURCE',source:[{file,lineStart:line,lineEnd:line,excerpt:match[0],sha256:sha(file)}],aliasReferences:[...value.matchAll(/var\((--[\w-]+)/g)].map(m=>m[1]),note:scope==='base'?'已加载基础声明；是否为最终生效值应查 effectiveThemes 和组件覆盖。':'当前 Material 作用域覆写；不是历史文档推测。'});
  }return tokens;
}
const declarations=[...block(baseFile,'@theme static','base','@theme static'),...block(baseFile,':root {','base',':root'),...block(matFile,'\n.lf-material {','materialDark','.lf-material'),...block(matFile,'.lf-material[data-theme=light] {','materialLight','.lf-material[data-theme=light]')];
const effectiveThemes={};
for(const mode of ['dark','light']){
  const map=new Map();for(const t of declarations.filter(t=>t.scope==='base'||t.scope==='materialDark'||(mode==='light'&&t.scope==='materialLight')))map.set(t.name,t);
  const resolve=(value,stack=[])=>value.replace(/var\((--[\w-]+)\)/g,(_,key)=>{if(stack.includes(key)||!map.has(key))throw Error(`别名无效 ${key}`);return resolve(map.get(key).value,[...stack,key]);});
  effectiveThemes[mode]=Object.fromEntries([...map].map(([name,t])=>[name,{value:t.value,resolvedValue:resolve(t.value,[name]),originId:t.id,evidence:'VERIFIED_SOURCE',note:'按作用域和选择器优先级展开；组件自身的 background 等属性仍可覆盖其用途。'}]));
}
const metrics=[];
function metric(id,file,line,value,unitName,meaningText,excerpt){const source=read(file).split(/\r?\n/)[line-1];if(!source?.includes(excerpt))throw Error(`${id} 证据不匹配`);metrics.push({id:`metric/${id}`,value,unit:unitName,meaning:meaningText,evidence:'VERIFIED_SOURCE',source:[{file,lineStart:line,lineEnd:line,excerpt,sha256:sha(file)}]});}
const site='frontend/src/components/material/site.css',lib='frontend/src/components/photo-library/photo-library.css',editor='frontend/src/components/photo-editor/photo-editor.css';
metric('button.radius',site,14,999,'px','当前 Material 通用按钮胶囊圆角','border-radius:999px');
metric('button.minHeight',site,14,44,'px','当前 Material 通用按钮最小高度','min-height:44px');
metric('button.loginMinHeight',matFile,150,52,'px','登录主操作最小高度','min-height:52px');
metric('card.materialRadius',site,8,16,'px','Material 通用卡片实际圆角','border-radius:16px');
metric('card.homeRadius',site,48,18,'px','品牌流程卡片圆角','border-radius:18px');
metric('card.loginRadius',matFile,142,20,'px','登录面板圆角','border-radius:20px');
metric('heading.desktopSize',site,3,44,'px','一般业务页桌面主标题','font-size:44px');
metric('heading.desktopWeight',site,3,500,'unitless','一般业务页桌面主标题字重','font-weight:500');
metric('heading.desktopTracking',site,3,-1.8,'px','桌面业务页主标题字距','letter-spacing:-1.8px');
metric('heading.mobileWebSize',site,59,35,'px','Web 窄屏业务页标题，不是小程序建议','font-size:35px');
metric('heading.desktopLineHeight',site,3,1.25,'unitless','桌面业务页主标题行高倍数','line-height:1.25');
metric('field.materialText',site,18,14,'px','通用输入文字最终 Material 覆写','font-size:14px');
metric('navigation.desktopMinHeight',matFile,65,88,'px','工作区桌面导航最小高度','min-height:88px');
metric('navigation.narrowMinHeight',matFile,158,74,'px','工作区小于等于720px的导航最小高度','min-height:74px');
metric('layout.desktopMaxWidth',matFile,69,1264,'px','工作区桌面主区最大宽度','max-width:1264px');
metric('layout.desktopPadding',matFile,69,32,'px','工作区桌面主区横向内边距，标题另加16px','padding:0 32px');
metric('list.desktopMinHeight',site,9,76,'px','Material 分组列表普通 div 行最小高度；button 行不一定匹配此选择器','min-height:76px');
metric('list.desktopPadding',site,9,'20px 24px',null,'Material 分组列表匹配行内边距','padding:20px 24px');
metric('list.mobileWebPadding',site,70,18,'px','Web 窄屏匹配分组列表行内边距','padding:18px');
metric('photo.canvas',lib,11,'#323232',null,'实际图库图片周围中性灰，浅深主题都保持','background:#323232');
metric('photo.editorCanvas',editor,13,'#323232',null,'实际编辑器照片画布周围中性灰','background:#323232');
metric('photo.gridGap',lib,6,12,'px','摄影师虚拟图库网格间隔','gap:12px');
metric('photo.assetRadius',lib,7,5,'px','摄影师照片卡片圆角，区别于业务卡片','border-radius:5px');
metric('photo.selectedBorder',lib,7,2,'px','摄影师照片卡片选择边框厚度','border:2px solid transparent');
metric('photo.viewerHeight',lib,16,55,'vh','摄影师图片预览区高度','height:55vh');
metric('photo.assetOpenHeight',lib,25,28,'px','最终覆盖后的查看按钮高度，移动端不可照搬','height:28px');
metric('overlay.material',site,24,'rgb(10 15 23 / .65)',null,'Material 对话框实际遮罩覆写','background:rgb(10 15 23 / .65)');
metric('overlay.blur',site,24,8,'px','Web 对话框背景模糊','backdrop-filter:blur(8px)');
metric('numeric.tabularSize',matFile,87,58,'px','桌面统计数字字号','font-size:58px');
metric('numeric.weight',matFile,87,350,'unitless','桌面统计数字细字重','font-weight:350');
metric('eyebrow.size',matFile,72,10,'px','品牌英文眉题字号，不能照搬为移动端重要说明','font-size:10px');
metric('eyebrow.tracking',matFile,72,1.5,'px','品牌英文眉题字距','letter-spacing:1.5px');
metric('themeToggle.iconSize','frontend/src/components/material/ThemeToggle.tsx',7,20,'px','主题图标尺寸','width="20"');
metric('themeToggle.stroke','frontend/src/components/material/ThemeToggle.tsx',7,1.5,'unitless','24单位图标画布的线宽','strokeWidth="1.5"');
metric('toast.defaultDuration','frontend/src/components/ui/Toast.tsx',16,3000,'ms','普通通知默认停留时间，非所有错误的消失规则','requestedDuration = 3000');
const proposals=[];
function mobile(id,value,unitName,meaningText,basis,rationale){proposals.push({id:`mini/${id}`,value,unit:unitName,meaning:meaningText,evidence:'PROPOSED_ADAPTATION',source:[],basis,rationale});}
mobile('page.gutter',16,'px','移动端左右基础留白',['base/--spacing-4'],'延续4px节奏；优先保持窄屏有效图片宽度。');
mobile('section.gap',24,'px','主要内容分区间距',['base/--spacing-6'],'分区留白大于行内间隔。');
mobile('card.padding',16,'px','客户业务卡片内边距',['base/--spacing-4','metric/card.materialRadius'],'区别于 Web 桌面24px列表内边距。');
mobile('row.gap',12,'px','列表和组件组间距',['base/--spacing-3'],'保留Web 12px节奏。');
mobile('touch.min',44,'px','独立交互最小有效触摸区域',['metric/button.minHeight'],'可见图标可较小，有效热区至少44px；实机验证。');
mobile('button.height',48,'px','移动端主要按钮常规高度',['base/--spacing-12'],'为中文动作和手指操作提供余量。');
mobile('button.radius',999,'px','移动端主要和次要按钮胶囊圆角',['metric/button.radius'],'保持当前Material几何。');
mobile('button.text',16,'px','移动端主操作文字',['base/--text-body'],'避免桌面小字号照搬。');
mobile('field.minHeight',48,'px','移动端普通输入行最小高度',['metric/field.materialText','mini/touch.min'],'标签及错误文案在输入框外另占空间。');
mobile('field.radius',10,'px','独立输入框圆角',['base/--radius-control'],'保留基础表单几何；分组表单内部用分隔线。');
mobile('card.radius',16,'px','移动端业务面板圆角',['metric/card.materialRadius'],'延续当前Material生效值。');
mobile('sheet.radius',16,'px','底部面板顶部圆角',['base/--radius-sheet'],'原生对话框由平台绘制，不能强行套用此值。');
mobile('title.size',28,'px','常规页面主标题',['metric/heading.desktopSize','base/--text-heading-lg'],'窄屏标题可换行，保持500字重而缩小桌面44px。');
mobile('title.weight',500,'unitless','移动端页面标题字重',['metric/heading.desktopWeight'],'延续非粗黑的编辑式标题。');
mobile('title.lineHeight',1.3,'unitless','移动端标题行高',['metric/heading.desktopLineHeight'],'中文换行时增加呼吸空间。');
mobile('title.tracking',0,'px','移动端中文标题字距',['metric/heading.desktopTracking'],'桌面负字距不机械移植到窄屏中文。');
mobile('sectionTitle.size',20,'px','移动端区块标题',['base/--text-heading-sm'],'区块标题弱于页面标题。');
mobile('body.size',16,'px','移动端主要正文',['base/--text-body'],'支持系统可访问性缩放。');
mobile('body.lineHeight',1.6,'unitless','移动端中文正文行高',['base/--leading-normal','base/--leading-relaxed'],'介于1.5和1.75之间，作为适配提案而非Web事实。');
mobile('secondary.size',14,'px','移动端辅助正文',['base/--text-body-sm'],'日期、数量、解释信息。');
mobile('caption.size',12,'px','移动端非关键图片编号和装饰说明',['base/--text-caption'],'核心说明不得降至Web眉题9-10px。');
mobile('icon.size',20,'px','常用线性图标可见尺寸',['metric/themeToggle.iconSize'],'沿用24单位图标画布习惯，实际文件由小程序自持。');
mobile('icon.stroke',1.5,'unitless','24单位线性图标建议线宽',['metric/themeToggle.stroke'],'避免混入不同线重整套图标。');
mobile('photo.canvas','#323232',null,'移动端照片预览中性背景',['metric/photo.canvas'],'跨主题保持照片周围中性，不随面板暖白改变。');
mobile('photo.gridGap',8,'px','移动端选片缩略图网格间隔',['metric/photo.gridGap','base/--spacing-2'],'比Web12px更紧凑，留出图片宽度。');
mobile('photo.radius',5,'px','移动端照片容器细圆角',['metric/photo.assetRadius'],'容器可圆角，照片内容不得被强制裁切。');
mobile('photo.selectedBorder',2,'px','移动端已选照片边界厚度',['metric/photo.selectedBorder'],'配合勾选与已选文字，不只用颜色。');
mobile('motion.pressDuration',100,'ms','触摸按下反馈时长',['base/--duration-instant'],'取消悬停依赖；减少动态效果时可立即更新。');
mobile('motion.transitionDuration',150,'ms','普通状态切换时长',['base/--duration-fast'],'不阻塞选片和返回。');
mobile('motion.ease','cubic-bezier(0, 0, 0.2, 1)',null,'轻量过渡缓动',['base/--ease-out'],'不引入重动画依赖。');
const unresolved=[
  {id:'unresolved/mini.minimumBaseLibrary',value:null,unit:null,meaning:'小程序最低基础库和WXSS变量能力待目标项目确认',source:[],evidence:'UNRESOLVED'},
  {id:'unresolved/navigation.nativeHeight',value:null,unit:'px',meaning:'原生导航和状态栏高度由设备提供，无统一固定设计数值',source:[],evidence:'UNRESOLVED'},
  {id:'unresolved/brand.approvedStaticAsset',value:null,unit:null,meaning:'已批准可分发的静态品牌肖像资产尚未在本次交付中提供',source:[],evidence:'UNRESOLVED'},
  {id:'unresolved/mini.bookingAvailability',value:null,unit:null,meaning:'价格、可预约日期和时段不是设计审计可推定的数据',source:[],evidence:'UNRESOLVED'},
];
const data={schemaVersion:'1.0.0',name:'LensFlow DS-01',language:'zh-CN',auditDate:'2026-10-18',repositoryHead:JSON.parse(read('docs/design-handoff/ds-01/evidence/repository-baseline.json')).head,evidenceVocabulary:{VERIFIED_SOURCE:'活动源码直接声明；未必视觉实测',VERIFIED_RENDER:'本次隔离浏览器可见证据',DOCUMENTED_ONLY:'仅文档记载',INFERRED:'解释性推断',PROPOSED_ADAPTATION:'小程序建议，不是Web事实',UNRESOLVED:'缺失或冲突待定'},notes:['统计以声明(scope,name)及局部指标为单位，保留别名；不是去重后的颜色数。','effectiveThemes为实际加载的基础加Material变量展开，不包含组件属性覆盖；filled按钮见metrics。','单位为px的数值均为CSS逻辑像素。rem断点以16px根字号举例，不擅自换算成rpx。','基础Web值与mobileProposals严格分离；本文件不导入React，不提供小程序运行代码。'],web:{declarations,metrics,effectiveThemes},mobileProposals:proposals,unresolved,counts:{verifiedSourceDeclarations:declarations.length,verifiedSourceMetrics:metrics.length,verifiedSourceTokens:declarations.length+metrics.length,proposedMobileTokens:proposals.length,unresolved:unresolved.length}};
fs.mkdirSync(path.join(out,'tokens'),{recursive:true});fs.writeFileSync(path.join(out,'tokens/lensflow-design-tokens.json'),JSON.stringify(data,null,2)+'\n');
const labels={base:'基础已加载声明',materialDark:'Material 默认深色覆写',materialLight:'Material 浅色覆写'};
let md='# 03 · 令牌参考\n\n日期：2026-10-18。以下内容由活动源码逐声明提取，数值未按旧设计稿替换。\n\n';
md+='权威文件：[机器可读令牌](tokens/lensflow-design-tokens.json)。每个条目包含 value、unit、meaning、source（相对仓库路径、起止行、原文和SHA-256）、evidence。纯尺寸保留CSS原文，unit解释该原文单位；不要再拼接一次单位。局部指标及小程序建议使用数值加unit。\n\n';
md+='## 读取和优先级\n\n当前入口依次加载 index.css → MaterialScope 的 material.css → site.css；页面另载图库/编辑器 CSS。base 是原始字典，materialDark 是 `.lf-material` 默认声明，materialLight 是更高优先级的浅色选择器覆写。浅色块虽然写在默认块之前，选择器优先级更高。effectiveThemes 按此顺序解析 CSS var 别名；不要仅凭文件行序决定胜负。\n\n';
md+='`#007AFF` 和 `#6B7A99` 都在基础层，但一般 filled 按钮由 site.css:14-16 改为 mat-control 底色、mat-button-text 文案和 mat-button-border 边框。实际画布为 #323232，不能将 surface-neutral 的 #F5F5F5 当作图库最终背景。\n\n';
md+='## 当前关键主题配对\n\n| 语义 | 浅色最终变量 | 深色最终变量 | 来源变量 |\n|---|---|---|---|\n';
for(const [label,name] of [['页面','--mat-page'],['面板','--mat-panel'],['控件','--mat-control'],['主文字','--mat-text'],['次文字','--mat-muted'],['分隔线','--mat-line'],['面板边界','--mat-border'],['强调／链接','--mat-accent'],['按钮文字','--mat-button-text'],['按钮边界','--mat-button-border'],['按钮悬停','--mat-button-hover'],['焦点','--mat-focus'],['成功底色','--color-success-bg'],['成功文字','--color-success-label'],['警告底色','--color-warning-bg'],['警告文字','--color-warning-label'],['错误底色','--color-error-bg'],['错误文字','--color-error-label'],['信息底色','--color-info-bg'],['信息文字','--color-info-label']])md+=`| ${label} | \`${effectiveThemes.light[name].resolvedValue}\` | \`${effectiveThemes.dark[name].resolvedValue}\` | \`${name}\` |\n`;
md+='\n## 基础排版与测量解释\n\n字体均为系统栈，没有发现活动React路径中的远程字体加载或独立图标库导入。系统栈声明 SF Pro 不保证设备已装该字体，中文由系统回退；小程序不应打包未获授权字体。基础标题36/30/24/20px，正文18/16/14px、说明12px；当前业务页实际覆盖为44px/500/1.25/-1.8px，Web窄屏35px。数字使用tabular-nums；统计卡片58px、350字重。基础4px节奏有明确声明，但当前局部也有18/22/26px，不应声称全站均为4的倍数。\n\n';
md+='普通UI过渡100/150/200/300/400ms均有声明，Button实际150ms、按下缩放0.97；不能由令牌存在推定每一状态已实现。没有发现统一路由转场规范，故不导出精确导航转场时间。基础阴影卡片值被 Material 的 none 覆盖；Modal保留独立阴影，品牌/照片/业务几何各不相同。\n\n';
for(const scope of ['base','materialDark','materialLight']){md+=`## ${labels[scope]}\n\n证据均为 VERIFIED_SOURCE；基础值可能被后层覆盖。\n\n| 标识 | 原始值 | 单位 | 含义 | 源码行 |\n|---|---|---|---|---|\n`;for(const t of declarations.filter(t=>t.scope===scope))md+=`| \`${t.name}\` | \`${t.value}\` | ${t.unit??'不适用／复合CSS'} | ${t.meaning} | \`${t.source[0].file}:${t.source[0].lineStart}\` |\n`;md+='\n';}
md+='## 当前组件局部指标\n\n证据均为 VERIFIED_SOURCE。此层揭示基础变量无法单独表示的最终样式。\n\n| 标识 | 值 | 单位 | 含义 | 源码行 |\n|---|---|---|---|---|\n';
for(const t of metrics)md+=`| \`${t.id}\` | \`${t.value}\` | ${t.unit??'不适用'} | ${t.meaning} | \`${t.source[0].file}:${t.source[0].lineStart}\` |\n`;
md+='\n## 小程序适配层\n\n以下全部是 PROPOSED_ADAPTATION，不是当前Web值。以逻辑px作为可读性与热区下限；间距若转为rpx，375px稿中16px=32rpx，但320px屏幕上32rpx只有约13.65px，44px热区不可直接固定为88rpx。字重与行高不乘二；1px边框不变成2px。建议值允许在真机字缩放测试后调整。\n\n| 标识 | 值 | 单位 | 语义与依据 |\n|---|---|---|---|\n';
for(const t of proposals)md+=`| \`${t.id}\` | \`${t.value}\` | ${t.unit??'不适用'} | ${t.meaning}；${t.rationale} |\n`;
md+='\n## 缺失证据\n\n';for(const t of unresolved)md+=`- UNRESOLVED：${t.meaning}；JSON值为null，不产生虚构精确值。\n`;
md+=`\n计数：${declarations.length} 条源码变量声明（含别名和主题覆写），${metrics.length} 个局部实测来源指标，共 ${declarations.length+metrics.length} 个 VERIFIED_SOURCE 条目；${proposals.length} 个小程序建议；${unresolved.length} 个未决值。VERIFIED_RENDER 以[截图索引](07-reference-index.md)为准，不将全部变量自动升级为渲染核验。\n\n相关：[源审计](01-source-audit.md) · [组件规格](04-component-specification.md) · [设计漂移](08-design-drift.md) · [交付入口](README.md)。\n`;
fs.writeFileSync(path.join(out,'03-token-reference.md'),md);console.log(JSON.stringify(data.counts));
