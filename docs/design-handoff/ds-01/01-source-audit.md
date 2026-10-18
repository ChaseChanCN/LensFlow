# 01 · 活动源码审计与设计库存

审计日期：2026-10-18（Asia/Shanghai）。分支 `design-system`；基线提交 `ea7cec43d297d6602f95b33b5c917d622c4b458f`。提交号仅定位基础版本，本次事实来源包含工作区既有未提交修改；精确内容由 [Git 基线](evidence/repository-baseline.json) 和令牌条目的 SHA-256 定位。没有把未提交实现误称为远端已发布版本。

## 范围、证据及保护

本次是 Web 设计提取，不重新设计、不改生产 UI、不实现小程序。初始工作区有后端、前端与历史报告的既有改动。未发现本仓库及已检查父目录的 `AGENTS.md`。基线记录了输出目录外 1,011 个 Git 跟踪或未忽略文件的字节哈希；最终对比见 [保护结果](evidence/repository-verification.json)。忽略目录和数据库内容不在该哈希证明范围；本任务没有启动、调用或迁移后端。

| 证据标记 | 本包中的严格含义 |
|---|---|
| VERIFIED_SOURCE | 直接在当前活动入口可达的源码或已加载样式中找到；声明存在不等于每页最终生效 |
| VERIFIED_RENDER | 本次实际浏览器截图或可见 DOM 的 computed style；数据使用隔离演示夹具 |
| DOCUMENTED_ONLY | 历史文档中的陈述，本次没有据此重测业务、性能或设备能力 |
| INFERRED | 对源码和画面作出的品牌／层级解释 |
| PROPOSED_ADAPTATION | 小程序结构、尺寸、手势和状态建议，不能冒充现有 Web 功能 |
| UNRESOLVED | 缺少证据、文档冲突、资产授权或平台目标待确定 |

## 活动入口与层叠关系

`frontend/src/main.tsx` 导入 `index.css` 和 `App`；`App.tsx` 中 `MaterialScope` 包住路由及 Toast。`MaterialScope.tsx:4-5` 导入 `material.css`、`site.css`；`:9-11` 避免重复主题作用域，`:15-28` 默认深色、持久化及跨标签同步。因此深色是应用级能力，并非只在首页有暗房背景。`Layout.tsx:13-80` 默认 `appearance='material'`，客户与摄影师共享。Modal／Toast 在 Portal 上重新声明主题。

层次为：Tailwind v4 基础变量 → `.lf-material` 默认深色变量及语义映射 → 高优先级 `[data-theme=light]` 覆写 → `site.css` 的组件选择器 → 各页面／图片工作区局部 CSS。`.lf-material[data-theme=light]` 虽在文件前面，选择器仍高于后面的 `.lf-material`。主题生效值见 [03](03-token-reference.md)，不能只读取 `index.css`。

没有可认定为单一权威版本的设计系统：`frontend/package.json` 是应用版本 `0.0.0`，`docs/design-tokens.md` 开头仍写 Phase 1，`docs/design-system.md` 记录 Phase 1–5，另有 Material 全站推广和后续图片工作区迭代。DS-01 采用日期＋工作区快照作为设计基线；`schemaVersion=1.0.0` 仅是本包 JSON 格式版本。

## 来源库存

下表源码引用均相对仓库根目录；数值的逐条证据在 JSON 内，交付后无需运行 React 即可阅读。

| 类别 | 活动源码 | 相关数值／组件 | 证据 | 说明 |
|---|---|---|---|---|
| 品牌 | `pages/LandingPage.tsx:6-34`、`components/material/PublicShell.tsx:7-13`（均在 `frontend/src/`） | LensFlow、◉、摄影流程01/02/03、短句与单一品牌入口 | VERIFIED_SOURCE；首页截图 VERIFIED_RENDER | 文字标记为现有实现，不是已交付矢量Logo；肖像静态分发权待确认 |
| 颜色 | `frontend/src/index.css:31-100`；`frontend/src/components/material/material.css:9-60` | 基础操作蓝 #007AFF、品牌蓝灰 #6B7A99；暖白／石墨蓝灰主题 | VERIFIED_SOURCE；主题配对部分 VERIFIED_RENDER | 两层均活动，不能把基础色当最终按钮色 |
| 字体 | `frontend/src/index.css:7-29`；`frontend/src/components/material/material.css:71-87`；`site.css:3-4,59` | 系统无衬线／等宽／数字栈；实际主标题44px/500，窄屏35px | VERIFIED_SOURCE；标题 computed style VERIFIED_RENDER | 中文系统回退；声明 SF Pro 不保证已安装；未发现活动React路径远程字体导入 |
| 间距 | `frontend/src/index.css:102-124`；`frontend/src/components/material/material.css:65-109`；`site.css:9-21` | 4px级数；桌面主区1264px、横内边32px，分组行20×24px | VERIFIED_SOURCE | 局部18/22/26px存在；按钮行不一定匹配 `.flex` div 覆写 |
| 圆角 | `frontend/src/index.css:126-131`；`frontend/src/components/material/site.css:8,14,48` | 基础8/10/12/16/full；现用卡片16、品牌18、登录20、按钮999px | VERIFIED_SOURCE；按钮999px VERIFIED_RENDER | 场景区别和历史覆盖并存，不能统一回基础10/12px |
| 边框 | `frontend/src/index.css:96-100,146-148`；`site.css:8,15` | 1px面板、2px选择／焦点；主题语义线色 | VERIFIED_SOURCE | 透明线应结合背景；选片不只靠线色 |
| 阴影 | `frontend/src/index.css:134-144`；`material.css:59`；`site.css:8,14,24` | Material卡片／按钮无阴影；Modal保留独立阴影和遮罩 | VERIFIED_SOURCE | hover 工具类仍在，局部生效需看 specificity；不能声称所有层无阴影 |
| 图标 | `ThemeToggle.tsx:6-7`、`ui/EmptyState.tsx:14-16`、`ui/Toast.tsx:14,43-46`、`ui/ListItem.tsx:47-50`（`frontend/src/components/`） | 手写SVG，24单位画布，1.5／1.75／2线宽；◉、箭头等文字符号 | VERIFIED_SOURCE | 无统一外部图标库导入；`antd` 在依赖清单，但活动 `src` 未见其导入，不能按 Ant Design 或 MUI 套件还原 |
| 导航 | `frontend/src/components/Layout.tsx:24-76`；`material/PublicShell.tsx:7-13`；`material/material.css:64-71,158-159` | 公共导航／角色导航，88px桌面、74px窄屏工作区导航；当前路由高亮 | VERIFIED_SOURCE；工作台截图 VERIFIED_RENDER | 小程序三Tab是新平台要求，Web客户导航只有“我的／预约” |
| 按钮 | `frontend/src/components/ui/Button.tsx:19-70`；`material/site.css:14-17`；`material/material.css:150-151` | filled/tinted/gray/plain/destructive；44px最小、胶囊；登录52px | VERIFIED_SOURCE；44px/颜色/圆角 VERIFIED_RENDER | 有loading、disabled、hover、active、focus；没有通用selected或success状态 |
| 表单 | `frontend/src/components/ui/Input.tsx:6-59`；`pages/client/BookingPage.tsx:65-142`；`pages/auth/LoginPage.tsx`、`RegisterPage.tsx` | Input/Select/Textarea；default/grouped；可见标签、错误关联 | VERIFIED_SOURCE；登录／预约截图 VERIFIED_RENDER | 预约没有时段库存、价格、可售日历；不要推定服务端业务能力 |
| 卡片 | `frontend/src/components/ui/Card.tsx:9-25`、`ListGroup.tsx:9-21`、`ListItem.tsx:31-56`；`material/site.css:5-13` | 业务分组与平面边框；标题主副层级；尾部动作 | VERIFIED_SOURCE；订单/客户页 VERIFIED_RENDER | 主体是列表／分组卡片，不是复杂管理表格 |
| 图片 | `frontend/src/components/photo-library/AssetGrid.tsx:12-21,69-77`、`photo-library.css:7-17,25,35`；`photo-editor/photo-editor.css:13-15` | contain、无滤镜无阴影、#323232画布；虚拟行、多密度、PhotoViewer／LightTable | VERIFIED_SOURCE；图库／Viewer VERIFIED_RENDER | 实际客户 SelectionPage 不渲染照片；不得把摄影师图库等同客户已上线能力 |
| 状态 | `frontend/src/components/ui/Badge.tsx:11-60`；`pages/client/ClientPage.tsx:11-24,113-122` | warning/accent/success/error；业务状态先映射通用词 | VERIFIED_SOURCE；演示状态 VERIFIED_RENDER | WAITING_SELECTION会映射confirmed；标签泛化是语义漂移，见08 |
| 反馈 | `frontend/src/components/ui/PageState.tsx:4-9`、`EmptyState.tsx:11-20`、`Spinner.tsx:10-18`、`Toast.tsx:16-65`、`Modal.tsx:21-52` | 明确加载文案／错误重试／空态CTA／Portal主题／3000ms通知 | VERIFIED_SOURCE；部分界面 VERIFIED_RENDER | 不能把既有测试通过当作本次所有状态实机通过 |
| 动效 | `frontend/src/index.css:149-157,214-240`；`ui/Button.tsx:58`；`effects/useEffectMotion.ts`、`EffectSurfaces.tsx`、`card-cursor-glow.css` | 150ms按钮反馈、0.97缩放、200ms Toast；减少动态效果；Beam/Metal/Orb/Gooey装饰 | VERIFIED_SOURCE | 不迁移任何粒子引擎；鼠标光晕留Web；未发现统一页面转场时长 |
| 响应式 | `frontend/src/index.css:117-124`；`material/material.css:156-161`；`material/site.css:56-80`；`photo-library.css:36`；`photo-editor.css:22` | 基础640/768/1024/1280，局部480/720/760/1000/1500px | VERIFIED_SOURCE | 多套断点；本次截图1280×720，不重签历史90组响应式报告 |
| 深浅主题 | `frontend/src/components/material/MaterialScope.tsx:15-28`；`MaterialTheme.ts:3-5`；`ui/Modal.tsx:38`、`Toast.tsx:63` | 默认深色、手动切换、storage同步、Portal同步 | VERIFIED_SOURCE；双主题截图 VERIFIED_RENDER | 小程序是否跟随系统是适配决策，不冒充Web现有自动跟随 |
| 无障碍 | `ui/Input.tsx:13-33`、`Button.tsx:55-65`、`Modal.tsx:31-49`、`Toast.tsx:39-46`；`index.css:232-240` | 表单关联、aria-busy、焦点管理、状态播报、减少动态效果 | VERIFIED_SOURCE | 用户真实读屏与触屏未测；不能宣称全面合规 |

## 页面核查与未被覆盖的部分

已阅读 Landing、Login、Register、Dashboard、Orders、OrderDetail、Client、Booking、Selection、Delivery，照片目录／查看器／LightTable、编辑器容器／视口／草稿反馈、上传及元数据反馈。`App.tsx` 路由树确认这些是活动页面，而 `frontend/src/dev/`、独立 `design-system.html` 和 effects preview 是展示入口，不作为生产视觉权威。

公共页面与业务共享Material语义；图片区另用中性画布并保留小圆角和密集工具。LightTable双图、编辑器参数和元数据索引属于摄影师工作区，客户小程序只提取图片呈现原则。账户区尚无独立客户“个人中心设置页”，Web `ClientPage` 同时承载账户入口、预约和订单。因此小程序“我的”的隐私／设置／支持入口均为适配建议。

## 文档权威冲突

| 历史来源 | DOCUMENTED_ONLY 的内容 | 当前源码事实 | 处理 |
|---|---|---|---|
| `docs/design-tokens.md` | 自称Phase 1，工作区白／#F2F2F7、主操作强蓝 | 应用Material暖白或石墨蓝灰，filled为中性底色描边 | 同时保留；移动端沿当前Material主视觉 |
| `docs/design-system.md` | 入口仍称Material试点待确认 | `docs/material-ui-site-rollout.md`记全站推广，App确实全局套Material | 以活动入口为事实；无单一版本号 |
| `docs/design-system-phase-5.md` | 2026-10-16的NOT_ACCEPTED、权限／流程／读屏问题 | 后端及客户页面本轮已有他人修改；DS-01未重测 | 历史风险不宣称仍全部复现，也不宣称已解决 |
| `docs/material-ui-site-rollout.md` | 90组布局与32组对比历史通过 | 本次仅对指定隔离页面截图及少量配对核验 | 历史结果不升级为本次验收 |
| `docs/image-processing-p3-b1.md` 至 C4/D1/D2 报告 | 图片工作区迭代记录 | 图库／Viewer／编辑器活动源码仍可查 | 只引用可在源码找到的视觉事实；不执行任何后续阶段 |

相关：[视觉原则](02-visual-principles.md) · [令牌](03-token-reference.md) · [设计漂移](08-design-drift.md) · [入口](README.md)。
