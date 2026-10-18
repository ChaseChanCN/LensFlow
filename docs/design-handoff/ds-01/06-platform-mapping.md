# 06 · Web 到原生微信小程序的映射

本文件是 PROPOSED_ADAPTATION。Web列的来源是VERIFIED_SOURCE；平台能力说明与项目适配分开，不把平台文档等同当前LensFlow实现。微信官网正文在本轮检索中未能读取，因此不承诺最低基础库、具体机型或全部WXSS特性已验证。可读取的第一方[微信API类型定义](https://raw.githubusercontent.com/wechat-miniprogram/api-typings/master/types/wx/lib.wx.api.d.ts)作为API名称与字段的参考；最终兼容性由CodeArts针对目标版本实测。

## 设计映射矩阵

| Web设计元素 | 源码 | 小程序对应方式 | 必须保留 | 可调整 | 避免 |
|---|---|---|---|---|---|
| CSS变量／主题别名 | `index.css`；`material.css:9-60` | 小程序自有语义变量或构建时静态字典 | effectiveThemes配对、状态语义、背景与文字一起切换 | 目标基础库不支持的能力用静态主题类／构建产物 | 直接引用LensFlow React或跨仓库加载CSS |
| React公共组件 | `components/ui/` | 原生WXML组件分层，样式由小程序自己实现 | 结构、层级、状态与可访问名称 | 事件、生命周期、原生组件选择 | JSX转换器／React运行时当设计交付依赖 |
| 默认深色与手动主题 | `MaterialScope.tsx:15-28` | 小程序自身主题策略；可由业务选择跟系统或手动 | 暖白／石墨成对值、图片画布恒定中性灰 | 初始跟随系统是建议，需产品确认 | 误称Web已自动跟随系统；只改页面不改原生栏和弹层 |
| 公共与角色桌面导航 | `Layout.tsx:24-76`、`PublicShell` | 三个原生Tab＋二级页面栈 | 清晰当前位置、返回、客户角色信息 | 一级“首页／订单／我的”，预约与详情入栈 | 88px网页nav直接贴在微信导航栏下 |
| Hover／active／focus | `Button.tsx:58`、`Input.tsx:11` | 触摸按下反馈、原生焦点／读屏状态 | 点击有反馈，禁用说明，异步操作防重复 | 取消hover、扩大热区、保持必要focus语义 | 只有hover才出现的选择和关闭按钮 |
| 响应式与尺寸 | `index.css:117-124`、Material局部media | 原生弹性布局，间距按需求用px或rpx | 层级、比例、4px节奏意图 | 手机列数、标题、页边距 | 把每个Web px一律乘二输出rpx |
| 普通／危险／文字按钮 | `Button.tsx`＋`site.css:14-17` | 原生button与小程序自持样式 | 胶囊、描边中性主按钮、语义危险色、loading | 48px常规高度提案 | 原生按钮默认绿色；只搬旧#007AFF filled |
| 输入／选择 | `Input.tsx`、`BookingPage` | 原生input／textarea／picker等 | 可见标签、已选值、校验、禁用、提交反馈 | 键盘类型、日期面板、移动行高 | HTML select弹层、捏造时段库存或价款 |
| 中心Modal／确认 | `Modal.tsx:38-49`、`site.css:24` | 简单原生dialog或适当底部sheet／独立页 | 任务边界、取消、返回、信息与动作顺序 | 位置、平台绘制、手势、原生遮罩 | 强制Web blur、过多套层、伪造微信授权框 |
| PhotoGrid与懒加载 | `AssetGrid.tsx`、`AssetThumbnail.tsx` | 原生图片网格＋分页／懒加载 | 完整比例、中性画布、编号、局部重试、稳定选择 | 两列、窄屏一列、只加载临近预览 | 一次加载所有原图、copy TanStack Virtual实例、cover裁切 |
| PhotoViewer | `PhotoViewer.tsx:9-36` | 合适原生预览或独立图像页 | 图像居中完整、前后／关闭、可读索引、选择上下文 | 手势与安全区、工具栏 | Canvas重写所有照片显示、预览冒称原片 |
| LightTable | `LightTablePage.tsx`、`LightTablePanel.tsx` | 客户小程序不要求 | 单图完整查看原则 | 客户只需单图浏览和选择 | 双图同步平移、摄影师评分／元数据工具 |
| 编辑工作台 | `PhotoWorkbench.tsx`、`PhotoViewport.tsx` | 客户端只呈现授权结果／反馈入口 | 不改原图、预览与交付区别、明确保存反馈 | 客户流程所需的确认方式 | 参数面板、裁切手柄、草稿CAS界面、像素算法移植 |
| 首页粒子hero | `ParticlePortrait.tsx:9-18,36-47`、`site.css:74-80` | 已批准静态品牌图或短轻量素材 | 主体构图、明暗、蓝灰气氛、图文关系 | 手机裁幅和短淡入 | Three.js、WebGL、GLSL、粒子数据／调优或替代重引擎 |
| Beam／Metal／Gooey／光晕 | `effects/EffectSurfaces.tsx`、`QuickActions.tsx`、`card-cursor-glow.css` | 细边、透明度、短按反馈、静态快捷入口 | 主次动作与处理状态 | 完全静态是有效适配 | 将装饰库变成功能依赖、鼠标跟随效果搬触屏 |
| 桌面键盘快捷键 | `AssetGrid.tsx:54-67`、LightTable | 可见触摸操作与明确返回 | 操作结果与选择不丢失 | 前后按钮／勾选，必要时原生手势 | Ctrl/Shift、多击、键盘说明成为客户操作前提 |
| 浏览器认证下载 | `api/deliveries.ts:38-41`、`utils/download.ts` | 授权下载、类型适当的原生预览／保存／打开 | 身份与文件对应、进度／失败／取消、结果文案 | 微信允许的文件动作、临时文件生命周期 | 把Blob链接直接搬来、文件令牌进日志／UI、对ZIP承诺保存相册 |
| Toast／页面错误 | `Toast.tsx`、`PageState.tsx` | 原生轻提示＋就地持久错误 | 成功／失败含义、重试入口与状态播报 | 位置、平台时长、关闭方式 | 所有错误用短Toast，读屏来不及读完 |

## px、rpx与字号的具体建议

建议以逻辑px定义可读字号、触摸下限和设备几何；间距和网格可按手机设计宽度转rpx。作为设计计算，若采用750rpx对应窗口宽W逻辑px，则 `px = rpx × W / 750`；375px稿的16px边距是32rpx，在320px屏幕只有约13.65px。此处是适配换算示例，WXSS能力仍需按[官方样式文档入口](https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxss.html)和目标环境核验，不能宣称本轮官网正文已复核。

因此44px热区不能只写固定88rpx后假定全设备都满足；可用px最小尺寸与弹性布局组合。1px边界不是2px；行高1.6和字重500不乘二。小程序字号建议见JSON，而Web原值仍完整保留。数值尺寸可按真机文本放大调整，避免单行省略关键状态和金额。

## 设备约束与页面行为

| 事项 | 适配规则 | 可验收结果 |
|---|---|---|
| 安全区与状态栏 | 读取真实窗口／安全区，原生栏优先；自定义栏需同时考虑胶囊和状态栏。相关字段见第一方类型的getWindowInfo | 顶部返回／标题与胶囊不重叠，底部按钮不落入手势区；不写统一“状态栏20px” |
| 原生导航／TabBar | 三个Tab由平台导航；二级页栈管理返回；页面占位按真实栏布局核算 | 不叠加两套头栏，不重复加原生TabBar的安全区高度 |
| 触摸目标 | 本项目建议独立目标至少44×44逻辑px，与视觉图标大小分开 | 320px窄屏及字体放大时仍达热区下限，不与相邻危险动作重叠 |
| 滚动与键盘 | 客户列表优先页面单一纵向滚动；内部横向图片浏览不抢纵滚；输入时可见当前标签与错误 | 无不必要双重滚动；键盘开启能完成表单与提交 |
| 显示缩放 | 系统字体回退、可换行、容器随内容高；照片比例不受字缩放影响 | 中文、英文文件名、长编号及大字不截掉关键内容 |
| 内存与加载 | 缩略图优先；按页加载；大图只保留必要邻近资源，离页释放；失败可单图重试 | 低内存设备不因一次解码整个订单而退出；行为靠实机观察验收，DS-01未测设备内存 |
| 动效 | 原生过渡优先；普通反馈100–150ms提案；无装饰仍能操作；支持适当减少动态效果 | 禁用动画时状态仍明确，无重动画运行依赖 |
| 网络与文件 | 处理断网、授权拒绝、下载失败、失效／撤回；按文件类型选择动作 | “下载完成”与“保存相册成功”有各自真实结果；不把失败报为成功 |

## 平台证据和责任边界

本轮成功读取第一方API类型文件，未在微信开发者工具或真机执行API；类型不是运行保证。官网[全局配置](https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html)、[窗口信息](https://developers.weixin.qq.com/miniprogram/dev/api/base/system/wx.getWindowInfo.html)、[下载](https://developers.weixin.qq.com/miniprogram/dev/api/network/download/wx.downloadFile.html)、[保存图片](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.saveImageToPhotosAlbum.html)作为CodeArts核验入口，正文未取得的内容保持UNRESOLVED，不用第三方教程代替官方兼容结论。

44px是本项目移动建议，不冒称WCAG 2.2 AA统一强制44px；W3C的[目标尺寸最低准则](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)定义的是另一组最低条件。普通文字对比度采用[W3C SC 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)4.5:1作为验收基准；这不等于小程序整体已完成可访问性认证。

相关：[页面](05-mobile-screen-guidelines.md) · [CodeArts](09-codearts-integration-guide.md) · [验收](10-acceptance-checklist.md) · [入口](README.md)。
