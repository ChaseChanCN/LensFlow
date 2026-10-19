# 07 · 真实视觉参考与捕获限制

共14张本次实际浏览器截图，全部为VERIFIED_RENDER；不是生成图、静态组件重绘或历史截图改名。截图事实日期为2026-10-18，交付文档在2026-10-19完成。所有截图保留工具返回的原始JPEG字节，没有裁图、覆盖文字或修饰。

## 安全预览方法

使用现有 `frontend/node_modules` 的Vite，配置仅新增于 [tools/preview.config.mjs](tools/preview.config.mjs)。以 `127.0.0.1:5197` 启动，固定端口、无API代理、显式清空VITE_API_BASE_URL并将envDir和优化缓存定位在DS-01内。`--configLoader native`避免默认打包配置产生外部临时配置。没有启动后端、数据库、迁移、通知，也没有访问现有开发服务。

只允许演示登录POST（返回固定本机测试标识，无真实认证）、已提供的只读GET；其余业务写入405，未提供GET明确503。演示订单91001、预约92001、用户93001/93002与照片94001–94006均为内存夹具，没有写入数据库。[请求清单](evidence/preview-requests.json)不记录登录正文。关键词索引等未提供接口产生的局部503是夹具覆盖限制，不是生产故障。演示身份邮箱使用保留示例域`example.invalid`，截图中的密码圆点仅为无效演示输入，不含真实凭据。

图库六张演示记录复用仓库既有 `backend/tests/fixtures/grace_hopper.jpg` 的原始字节，以文件流只读提供；没有复制、修改或生成照片。该夹具在 `backend/tests/fixtures/README.md:3-9`注明为James S. Davis／United States Navy的Grace Hopper公开领域肖像，SHA-256为 `e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。本包只包含应用截图，不另附原图。品牌首页是当前应用自带肖像渲染结果，只作为视觉参照，不授权把截图转成小程序品牌资产。

## 尺寸与证据边界

桌面浏览器DOM报告CSS视口1280×720，移动覆盖为375×812；截图工具返回的JPEG像素尺寸却不同（见下表）。桌面参考存在右侧截断及当前滚动位置的局部画面，移动图也有缩放。即使请求了截图API的 `fullPage:false`，也不能声称图片覆盖完整CSS宽度。不得用JPEG像素反推设计尺寸，不能据截图右侧截断判定应用横向溢出。精确颜色、字号、圆角以JSON源码和[浅色computed style](evidence/render-light.json)、[深色computed style](evidence/render-dark.json)为准。

这14张能确认可见区域的构图、主题、照片周边与组件状态，不能签署全设备响应式、完整页面像素比对、iOS／Android触屏、读屏或生产性能。移动覆盖已在结束前reset；临时标签页及本次Vite进程均已关闭。

## 截图索引

共同构建基准：HEAD `ea7cec43d297d6602f95b33b5c917d622c4b458f` 加既有工作区；Vite 8.3.4开发模式，活动React入口，非生产dist。并发工作流曾更新选片的重载处理和交付API类型，未改变本次主题令牌；源码差异见保护报告。截图的完成时来源指纹与时间另见 [机器索引](evidence/reference-captures.json)。

| 文件 | 页面／捕获状态 | CSS视口 | JPEG像素 | 主题 | 主要活动来源 | 方法／证据 |
|---|---|---|---|---|---|---|
| [01-home-dark.jpg](references/01-home-dark.jpg) | `/`，品牌hero可见区域 | 1280×720 | 968×712 | dark | LandingPage、ParticlePortrait、site.css | 隔离IAB截图；VERIFIED_RENDER |
| [02-home-light.jpg](references/02-home-light.jpg) | `/`，reference4浅色hero | 1280×720 | 968×712 | light | LandingPage、ParticlePortrait、site.css | 同页主题按钮切换；VERIFIED_RENDER |
| [03-login-light.jpg](references/03-login-light.jpg) | `/login`，演示填写状态，右侧局部 | 1280×720 | 968×712 | light | LoginPage、Input、Button、material.css | 实际路由表单；VERIFIED_RENDER |
| [04-dashboard-light.jpg](references/04-dashboard-light.jpg) | `/dashboard`，统计和预约区域，已滚动 | 1280×720 | 968×712 | light | DashboardPage、ListItem、QuickActions | 演示读接口＋实际组件；VERIFIED_RENDER |
| [05-dashboard-dark.jpg](references/05-dashboard-dark.jpg) | `/dashboard`，标题与统计区 | 1280×720 | 968×712 | dark | 同上 | 主题切换后截图；VERIFIED_RENDER |
| [06-library-dark.jpg](references/06-library-dark.jpg) | `/orders/91001/library`，滚至照片区 | 1280×720 | 968×712 | dark | PhotoLibraryPage、AssetGrid、AssetThumbnail | 公开肖像夹具，未改原图；VERIFIED_RENDER |
| [07-viewer-dark.jpg](references/07-viewer-dark.jpg) | 同路由的PhotoViewer Modal | 1280×720 | 979×720 | dark | PhotoViewer、Modal、photo-library.css | UI“查看”打开；VERIFIED_RENDER |
| [08-booking-dark.jpg](references/08-booking-dark.jpg) | `/booking`，分组字段区域 | 1280×720 | 968×712 | dark | BookingPage、Input、Select | 只查看，未提交预约；VERIFIED_RENDER |
| [09-client-dark.jpg](references/09-client-dark.jpg) | `/client`，客户快捷操作与预约 | 1280×720 | 968×712 | dark | ClientPage、ListGroup、QuickActions | 本机演示客户；VERIFIED_RENDER |
| [10-client-light.jpg](references/10-client-light.jpg) | `/client`，同一客户分组 | 1280×720 | 968×712 | light | 同上 | 主题切换；VERIFIED_RENDER |
| [11-selection-light.jpg](references/11-selection-light.jpg) | `/orders/91001/selection`，已选1/3，无缩略图 | 1280×720 | 979×720 | light | SelectionPage、Badge、Button | 真实编号卡片，未提交；VERIFIED_RENDER |
| [12-delivery-empty-light.jpg](references/12-delivery-empty-light.jpg) | `/orders/91001/delivery`，暂无交付 | 1280×720 | 979×720 | light | DeliveryPage、EmptyState、ListGroup | 演示404→实际空态；VERIFIED_RENDER |
| [13-booking-mobile-dark.jpg](references/13-booking-mobile-dark.jpg) | `/booking`，手机纵向分组字段 | 375×812 | 360×779 | dark | BookingPage＋Material窄屏规则 | 浏览器viewport覆盖，非微信实机；VERIFIED_RENDER |
| [14-home-mobile-light.jpg](references/14-home-mobile-light.jpg) | `/`，手机上图下文 | 375×812 | 360×779 | light | LandingPage＋site.css窄屏规则 | 同上；VERIFIED_RENDER |

## 已看到的内容与未捕获项

已看到：浅色暖白、深色石墨、主按钮胶囊与边框、较大中等字重标题、分组表单、客户编号选片、照片contain周边灰和Viewer Portal遮罩。浅色computed style确认工作台主标题44px/500/-1.8px、普通操作44px高与999px圆角，底色rgb(239,238,233)；深色Viewer的照片画布rgb(50,50,50)、Canvas517×606、filter:none、box-shadow:none。

未捕获：独立Toast状态、所有按钮全态、完整订单详情、编辑器／LightTable运行截图、完成交付文件下载、320/414/768及全部大字设备矩阵。它们依据源码或保持未验证，不将其他历史目录截图伪称本轮VERIFIED_RENDER。历史截图未复制进本目录，也未当作当前权威。

## 复核命令

在仓库根目录按需运行，仅启动隔离前端：

```powershell
node frontend/node_modules/vite/bin/vite.js --config docs/design-handoff/ds-01/tools/preview.config.mjs --configLoader native
```

复核完成停止该进程。配置不得替换为生产vite.config.ts或指向真实后端，夹具不构成API契约与端到端业务验收。

相关：[源审计](01-source-audit.md) · [视觉原则](02-visual-principles.md) · [漂移](08-design-drift.md) · [入口](README.md)。
