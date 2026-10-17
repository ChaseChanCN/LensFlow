# LensFlow P3-B1：数字资产管理基础实施报告

日期：2026-10-17。范围：认证原图缩略图、订单照片游标目录、虚拟图库、单图查看器与既有编辑器入口。

## 1. 结论与完成边界

已实现真实后端和摄影师页面，完成隔离数据库、文件存储及浏览器联调。后端全量 **298 通过、1 跳过**；前端全量 **266 通过、43 个测试文件**；TypeScript 与生产构建通过。Lint 退出码 0，但有 **4 条警告**，详见测试章节。

真实浏览器浏览了 1,000 条元数据记录；原图来源为受控复用的 8 个真实 JPEG 文件，另外通过真实上传页面上传 2 张 JPEG。该结果不是 1,000 张独立高分辨率照片压测，也不是 5,000 张性能结论。

| 状态 | 内容 |
| --- | --- |
| 已实现并验证 | Bearer 鉴权、照片→订单授权、128/256/512 缩略图、原图不变、缓存命中/失效/损坏恢复、原子发布、SQL 游标分页、Blob 资源取消与回收、真实虚拟列表、密度切换、查看器及编辑器往返 |
| 已实现但未独立完成环境验证 | 多工作进程同时运行时的整体磁盘配额、部署容器卷权限、低端设备及 24MP 大库持续压力；不能以本地单进程结果替代 |
| 本阶段未实现 | 评分、标签、Pick/Reject、Light Table、RAW、批量编辑/导出、RetouchVersion 发布及 Delivery 变更 |
| 环境限制 | 现有 OBS 无可复用的二进制读取能力，本接口明确返回 503；Windows 不允许测试符号链接，既有 symlink 测试跳过 |

未新增数据库模型或迁移，未执行开发数据库升级。未修改首页粒子、全局设计系统、图像处理算法及草稿业务逻辑。原工作区已有大量未提交修改，本报告文件清单仅列本轮增量，不能把整个 `git diff` 当成本轮改动。

## 2. 实际代码审计与复用

- `backend/app/models/photo.py`、`order.py`：沿用 Photo 与 Order 身份、订单归属及现有字段；不增加拍摄时间、评分、相机等虚构数据。
- `backend/app/services/photo_access.py`：新接口复用 `require_photo_access` / `require_order_access`，以数据库真实归属授权。订单所属摄影师、客户可以读取；其他摄影师/客户及不在允许角色内的管理员不能旁路获取照片。
- `backend/app/services/image_editor.py`：复用 `normalized_source`、`render_slot` 与 sRGB 策略，保留 20 MiB / 24MP / 单边 12000px 限制。同步路由由 FastAPI 线程池执行，不在异步事件循环中进行 Pillow 解码。
- `backend/app/services/photo_edit_draft.py`：复用只读 `source_fingerprint`；不读取编辑参数生成原图缩略图。
- `backend/app/services/storage.py`：复用 LocalStorage 的安全只读路径，OBS 不被当成本地路径。缓存单独放在原图存储目录的同级派生目录。
- `frontend/src/api/client.ts`、认证 Store、TanStack Query、Layout、Button、Modal、既有 `usePhotoResource` 均复用。
- `backend/tests/conftest.py` 的 fail-closed SQLite/上传/后台 Session/通知隔离机制继续使用，本轮没有改变它。

### 数据库及索引

仓库 Alembic head 为 `b2d4a6c8e010`；真实开发 SQLite revision 为 `5e0b2fd720d3`，本轮只读检查，没有升级。已有 `ix_photos_order_id` 在当前 SQLite 整数主键下支持本查询，实际 EXPLAIN：

```text
SEARCH photos USING INDEX ix_photos_order_id (order_id=? AND rowid>? AND rowid<?)
```

因此没有添加重复索引或迁移。其他数据库部署需要单独检查执行计划，本轮没有宣称 PostgreSQL 在线性能已验证。

## 3. 架构和文件清单

```text
照片图库 → TanStack Query 元数据页 → PhotoAsset → TanStack Virtual 可见行
                                                    ↓
                                      ThumbnailPool → 认证 Axios Blob
                                                    ↓
FastAPI → Photo/Order 授权 → 原图 SHA256 → 独立磁盘缓存 → JPEG
                                   cache miss → 既有 decode/ICC/EXIF + render_slot

卡片 → 既有 Modal + usePhotoResource 原图预览 → 既有 PhotoWorkbench
```

以下路径均相对于 `C:/Users/Chase/Desktop/LensFlow/`：

| 文件 | 本轮职责 |
| --- | --- |
| `backend/app/schemas/photo_catalog.py`（新增） | 白名单照片元数据与分页响应 |
| `backend/app/services/photo_catalog.py`（新增） | 签名游标、SQL keyset 分页 |
| `backend/app/services/thumbnails.py`（新增） | 缩略图派生、缓存、并发与清理 |
| `backend/app/api/v1/photo_catalog.py`（新增） | 缩略图、目录、单张元数据三个接口 |
| `backend/app/main.py` | 注册新路由 |
| `backend/tests/test_photo_catalog.py`（新增） | 缩略图、安全、缓存、分页及兼容性测试 |
| `frontend/src/api/photoCatalog.ts`（新增） | PhotoAsset 适配及认证请求 |
| `frontend/src/api/photoCatalog.test.ts`（新增） | DTO、游标请求、Blob 类型校验 |
| `frontend/src/components/photo-library/ThumbnailPool.ts`（新增） | 有界请求池、Blob LRU 与 URL 生命周期 |
| 同目录 `ThumbnailPool.test.ts`（新增） | 并发、复用、取消、晚到响应、回收、无认证拒绝 |
| 同目录 `useThumbnail.ts`、`AssetThumbnail.tsx`（新增） | 稳定资源订阅、加载/失败/重试 |
| 同目录 `usePhotoCatalog.ts`（新增） | 分页 Query、订单隔离和取消 |
| 同目录 `AssetGrid.tsx`（新增） | 响应式虚拟行、密度、键盘与位置记录 |
| 同目录 `PhotoViewer.tsx`（新增） | 原图适应视口预览、前后导航及编辑动作 |
| 同目录 `photo-library.css`（新增） | 局部图库样式，中性照片背景 |
| 同目录 `library.test.tsx`、`PhotoViewer.test.tsx`（新增） | 实际虚拟器组件及查看器资源集成测试 |
| `frontend/src/pages/photographer/PhotoLibraryPage.tsx` 及 `.test.tsx`（新增） | 摄影师入口、错误恢复、滚动状态与查看器集成 |
| `frontend/src/pages/photographer/PhotoEditorPage.tsx` 及 `.test.tsx` | 图库来源采用单张元数据加载，返回图库；保留原入口 |
| `frontend/src/components/photo-editor/PhotoWorkbench.tsx` | 仅两处 props 类型由 `Photo` 收窄为 `Pick<Photo,'id'>`，没有运行时/算法变化 |
| `frontend/src/pages/photographer/UploadPage.tsx` | 摄影师图库入口、上传后目录失效 |
| `frontend/src/pages/photographer/AnalysisResultPage.tsx`、`OrderDetailPage.tsx` | 订单内摄影师图库入口 |
| `frontend/src/App.tsx` | 懒加载受保护图库路由 |
| `frontend/package.json`、`package-lock.json` | 新增小型虚拟化依赖 |
| `docs/image-processing-p3-b1.md` 及同名目录 | 报告、截图、JUnit、测量与保护检查证据 |

验收专用启动器和代理配置放在 `.agentwork/p3-b1/`，仅用于临时环境，不是产品路由或生产配置。

## 4. API 合同

所有请求都使用现有 `Authorization: Bearer <access_token>`。新响应不返回 `storage_key` 或原图公开访问地址。

### GET `/api/v1/photos/{photo_id}/thumbnail?size=256`

`size` 仅接受 128、256、512，默认 256。只允许 `size` 查询参数；尺寸为最大边，不拉伸、不放大小图。

```http
GET /api/v1/photos/936/thumbnail?size=256
Authorization: Bearer <access_token>

HTTP/1.1 200 OK
Content-Type: image/jpeg
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Authorization
X-Content-Type-Options: nosniff
X-Thumbnail-Cache: HIT

<真实 JPEG 二进制>
```

真实浏览器下载验证：218×256，JPEG，包含规范 sRGB ICC，已无 Orientation；下载字节与认证 HTTP 命中返回完全相同。

### GET `/api/v1/orders/{order_id}/photos/catalog?limit=50&cursor=...`

默认 50，范围 1–100；cursor 为服务端返回的不透明签名字符串，非空、最大 512 字符。未知查询参数拒绝。响应示例，时间值为合同示意：

```json
{
  "items": [{
    "id": 936,
    "order_id": 1,
    "filename": "catalog-0936.jpg",
    "mime": "image/jpeg",
    "size_bytes": 61306,
    "width": 517,
    "height": 606,
    "created_at": "2026-10-17T07:00:00Z"
  }],
  "next_cursor": null,
  "has_more": false
}
```

有后续页时 `has_more=true` 且 `next_cursor` 为字符串；尾页为 false/null。实际字段沿用 `mime`，前端适配为 `mimeType`。尺寸未知时保持 null。SQLite 无时区创建时间在响应中按现有 UTC 存储约定规范化。

### GET `/api/v1/orders/{order_id}/photos/{photo_id}/asset`

返回单个同结构元数据对象；同时验证照片实际订单归属及 URL 订单匹配。供图库进入编辑器使用，避免进入编辑器时请求整张照片列表。目录和单张元数据响应均为 `private, no-store`。

### 失败行为

| 状态 | 行为 |
| --- | --- |
| 401 / 403 | 未认证 / 无权读取；缓存命中同样先授权 |
| 404 | 照片、订单或原文件不存在；列表陈旧时允许刷新恢复 |
| 409 | 指纹计算与解码之间源文件发生变化，拒绝发布旧身份的缓存 |
| 413 | 现有输入字节/像素/单边限制超出 |
| 422 | 非法游标、变体、未知查询、不支持或损坏 JPEG |
| 429 | 现有图像槽位、缩略图锁或发布维护锁繁忙；前端有限退避后提供重试 |
| 503 | OBS 缩略图读取不支持、缓存目录不可用/磁盘写入失败 |

业务异常沿用 `{ "code": "...", "message": "...", "detail": "..." }`；FastAPI 参数约束错误沿用项目现有验证响应。失败不伪造成功 JPEG。

## 5. 缩略图缓存、安全和资源策略

1. 每次先通过真实 Photo→Order 授权，再计算缓存身份；拥有缓存不能替代权限。
2. Key = SHA256(`storage_key:实际源文件SHA256:size:RECIPE`)；当前 recipe 为 `original-srgb-jpeg90-lanczos-v1`。源字节、尺寸或 recipe 改变即使用不同身份。编辑草稿不参与 key。
3. 命中仍以有界分块读取原文件计算 SHA256，避免过期源复用；**避免的是全图解码，不是原文件读取**。缓存只解码尺寸受限的小 JPEG 验证完整性。
4. 缓存目录为原存储目录的同级 `<目录名>.lensflow-cache`；不属于原图目录，不挂载为公开 URL。仅服务端生成 64 位十六进制键，检查 resolve 后父目录及符号链接，不能由客户端指定路径。
5. Miss 使用既有 `normalized_source` 和同一个 `render_slot`，LANCZOS 下采样，JPEG quality90 / subsampling0；不应用曝光、裁剪等编辑参数。ICC 生成时间头规范为固定值、清零 profile ID，使相同工具链与 recipe 下输出字节稳定；不改变色度数据。编解码工具链升级应升级 recipe。
6. 固定 32 个非阻塞条带锁，不为每张图无限新增锁；Miss 不绕过现有渲染并发限制。没有后台预生成队列。
7. 先写独立 `.key.uuid.tmp`，flush/fsync 后 `os.replace` 原子发布；异常 finally 删除临时文件。损坏、超龄或不符合 ICC/尺寸约定的缓存删除后重建。
8. TTL 7 天，最多 4096 个已识别缓存或 128MiB；Miss 发布前按生成时间清理最旧缓存；读取时也拒绝超龄条目。超过 1 小时的本服务命名临时文件在维护时清理。不是访问时间 LRU；不是定时全盘后台 GC。
9. 清理只针对精确命名规则文件，忽略无关文件/链接。删除原图后遗留的缓存不能再通过授权链读取，后续 TTL/配额维护回收。
10. 配额是进程协作的维护政策，跨进程没有全局配额预留事务；多 worker 可能暂时超额。原子 rename 防止半文件，但不等于跨 worker 全局锁。严格磁盘配额需要部署卷配额/后续集中维护策略。

浏览器 HTTP 缓存采取保守 `no-store`，本阶段没有 ETag/304。磁盘派生缓存和页面内 Blob 复用是独立机制。

## 6. 分页与一致性

- SQL 按唯一 `Photo.id ASC` 排序，使用 `id > after AND id <= ceiling`；不使用不唯一创建时间排序，不在 Python 拉全量后切片。
- 首次请求读取订单最大 ID 作为固定上界，查询 `limit+1` 判断是否还有下一页。
- 游标 payload 为版本、订单、用户、after、ceiling，使用现有服务器 secret 和专用前缀 HMAC-SHA256 签名，拒绝跨用户/订单复用及篡改。
- 新增更高 ID 不进入当前浏览序列，手动刷新后出现；删除项自然跳过，不导致 offset 位移。既有 listPhotos 语义未改变。
- 这是固定上界的连续浏览，**不是数据库事务快照**。并发更新可在后页显示新字段；SQLite 删除最大 rowid 后重用 ID 的极端场景也不具备严格快照保证。
- 查询只选择卡片必要字段，无 N+1。1006 条同时间戳测试验证分页、插入删除边界和最多 4 次 SQL 的请求行为。

## 7. 前端数据、虚拟化与导航

### PhotoAsset 与资源分离

PhotoAsset 包含 id/orderId/filename/mimeType/width/height/sizeBytes/createdAt/displayAspectRatio，严格适配响应。未知宽高不编造；缩略图状态保存在独立资源池，不是第二份照片数据库。

`usePhotoCatalog` 使用 `[photo-catalog,userId,orderId]` Query key，signal 传给 Axios；不同订单不会接收旧响应。50 张增量加载，接近底部取下一页，`cancelRefetch:false` 避免同游标并发重复请求。局部失败保留已加载照片，显示“重试下一页”，不会显示成空订单。上传后失效目录，手动刷新重置分页上界。

### Blob 生命周期

- ThumbnailPool 按页面/订单/认证身份持有；token 变化销毁旧池，无 token 不发请求。StrictMode 清理后通过 activate 恢复生命周期。
- 同 photoId:size 请求去重，最多 4 个客户端请求同时运行；等待/执行/退避操作最多 128。429 最多自动重试两次，等待 350/700ms，之后明确失败。
- 离开虚拟行释放订阅；无订阅的未完成请求取消，晚到响应通过 signal/entry 身份拒绝。
- Object URL 仅在有订阅时存在，最后一个订阅释放立即 revoke；Blob 在页面内短期复用，避免反复滚动每次重新下载。
- 未使用 Blob LRU 目标最多 96 项 / 24MiB，闲置 60 秒在下一次订阅/trim 时失效。当前可见订阅不被逐出，因此不是对所有活跃对象的严格 24MiB 硬上限；活跃对象由虚拟视口和缩略图尺寸约束。没有定时清理线程，也没有 localStorage/IndexedDB 图片持久化。
- 离开页面/换订单/认证变化：abort、清除退避 timer、revoke 全部 URL。查看器复用的资源 hook 关闭 ImageBitmap/释放 fallback 资源。

### 虚拟化选择

现有依赖无合适的图库虚拟器，新增 `@tanstack/react-virtual@3.14.21`（virtual-core3.19.6），无新增后端依赖。安装时 npm audit 为 0 vulnerabilities。使用官方元素滚动适配器：[TanStack Virtual React 文档](https://tanstack.com/virtual/latest/docs/framework/react/react-virtual)。

网格按固定几何虚拟化行，overscan 2 行；ResizeObserver 测量宽度，紧凑/标准/宽松计算列数，分别取 128/256/512 变体。照片在中性背景中 contain 显示，卡片预留固定比例框，图片到达不会撑开布局；不叠加装饰鼠标光晕。

方向键、Home/End 移动焦点，Enter 打开；密度/宽度变化按锚点行重新定位，尾行允许不满列。用户/订单级视图状态在内存 Map 保存，最多 16 项，返回编辑器后恢复密度、焦点及滚动位置。整页刷新不持久化滚动；很久后 Query 页数据被回收也不保证深位置完整恢复。

新路由：`/orders/:id/library`，现有 ProtectedRoute 和摄影师角色限制。Upload、AnalysisResult、OrderDetail 内增加摄影师“照片图库”入口，不更改全局导航。

查看器采用现有 Modal：真实认证 preview、适应视口、已加载序列前后导航、元数据、Escape；关闭保留底层网格。编辑仍进 `/orders/:id/photos/:photoId/edit?from=library`。这里只更换元数据入口及返回动作，复用原 PhotoWorkbench；直接访问旧编辑路径仍使用原流程。

## 8. 实际测试结果

工作目录与命令如下；JUnit 原始记录在同名证据目录，不以构建成功代替行为测试。

```powershell
# 仓库根目录中的 Python 环境：.agentwork/design-system/p5-venv/Scripts/python.exe
# backend 工作目录，目标测试
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_photo_catalog.py -q
# backend 工作目录，全量测试
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest -q --junitxml=../.agentwork/p3-b1/backend-tests.xml

# frontend 工作目录
npx --no-install tsc -b
npm run build
npx --no-install vitest run --reporter=default --reporter=junit --outputFile=../.agentwork/p3-b1/frontend-tests.xml
npm run lint
```

| 检查 | 实际结果 |
| --- | --- |
| 后端目标测试 | 8 passed（包含多尺寸参数化及组合安全/缓存断言） |
| 后端最终全量 | 298 passed, 1 skipped, 5 warnings，219.45 秒 |
| 前端最终全量 | 266 passed，43 files，18.19 秒墙钟时间 |
| TypeScript | 退出码 0 |
| 生产构建 | 退出码 0；图库 lazy JS46.50kB / gzip15.11kB，主入口283.98kB / gzip83.59kB；应同时考虑共享 chunks，不能只用主入口代表总成本 |
| Lint | 退出码 0，4 warnings；没有宣称无警告 |

后端跳过项为 `test_symlink_cannot_escape`：当前 Windows 不允许测试创建符号链接。后端警告为既有 Starlette/httpx、Alembic path_separator 弃用提示。

前端 lint：既有 ParticlePortrait effect dependency 1 条、DarkroomVideoBackground setState-in-effect 2 条；新增 AssetGrid 的 TanStack Virtual imperative API 与 React Compiler memoization 兼容提示 1 条。AssetGrid 已明确 `use no memo`，当前 Vite 未启用 React Compiler；未来启用编译器时应重新验证该边界，不能直接消除提示后宣称兼容。

Vitest 有既有 Toast act 提示及 jsdom Canvas 未实现提示；行为测试按 mock 环境判断，不把它们称为浏览器绘制性能测试。新增查看器 hook 集成测试专门覆盖请求取消、晚到响应、位图关闭与失败重试。

测试过程中发现并修正：权限测试错误地预期订单所属客户无权读取；SQL 计数曾包含测试自身过期 ORM 属性访问；前端 constructor parameter property 不适用项目 erasableSyntaxOnly。修正后重新执行完整回归，上述为最终结果。

## 9. 隔离与真实浏览器验收

pytest 在导入 app 前建立 `lensflow-pytest-*` 临时 SQLite/上传目录，后台 Session 指向同一隔离引擎，通知配置清空，session 结束清理。开发存储指纹 guard 在全量测试中通过。

真实浏览器环境：

- 根目录 `C:/Users/Chase/AppData/Local/Temp/lensflow-p3b1-browser-8zhsuwio`。
- DB `browser.sqlite`，上传目录 `uploads`，缩略图缓存 `uploads.lensflow-cache`。
- FastAPI 仅监听 `127.0.0.1:8048`，专用 Vite 代理 `127.0.0.1:4248`。没有替换用户原服务或代理配置。
- 仅对这个临时 DB 应用现有 Alembic head，创建测试摄影师、客户及另一个摄影师。
- 测试结束关闭本轮标签 15 和两个专用服务；临时 DB/上传/缓存根目录实际不存在，两个端口已不再监听。证据见 `cleanup.json`。

实际执行顺序：登录摄影师 → 上传真实 `grace_hopper.jpg` 两次 → 订单2图库显示2张 → 查看器前后切换 → 进入照片1002既有修图工作台 → 返回图库 → 订单1遍历1000条 → 密度切换 → Escape/编辑器返回位置检查 → 认证缩略图下载和 Pillow 校验。

HTTP 独立验证：所属用户缩略图200，未登录401，另一摄影师在已有缓存时仍403，另一摄影师读目录403。下载文件与 HTTP HIT 字节一致。10个原文件处理前后 SHA256 均相同；无编辑草稿、RetouchVersion 或 Delivery 记录新增。真实上传触发原分析流程，产生2条分析记录，这是预期行为。

### 截图

真实深色首屏，已显示真实缩略图：

![真实深色图库首屏](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b1/library-initial-dark.png)

真实原图查看器：

![真实照片查看器](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b1/viewer-dark.png)

1000条加载完成后的浅色图库：

![浅色1000条图库](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b1/library-1000-light.png)

最后认证资源生命周期修正后的浏览器复查：25个已挂载 img 全部为可解码的 Blob URL。

![最终浅色图库复查](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b1/library-final-light.png)

## 10. 大目录测量及解读

Windows 桌面本地浏览器，1000条元数据，复用8个真实JPEG。记录见 `large-library-measurements.json`、`http-events.json`。这些是采样值，不是所有帧的严格最大值。

| 指标 | 实测 |
| --- | --- |
| 首屏 | 50条元数据，5列，25张挂载卡片/25个图片元素 |
| 首屏目录请求 | 1次 |
| 首屏已完成缩略图HTTP请求 | 38次，包含429重试和取消交叠，不是25次 |
| 滚动到1000条尾部 | 20次目录请求，20个不同游标查询；尾部25张挂载 |
| 标准密度滚动采样挂载峰值 | 40张 |
| 到尾部阶段已完成缩略图请求 | 665次；滚动经过的可见/overscan项按需获取，没有预取全部1000缩略图 |
| 紧凑密度 | 8列，48张挂载，交互到React布局提交8.30ms |
| 宽松密度 | 4列，24张挂载，11.50ms |
| 标准密度恢复 | 5列，35张挂载，7.60ms |
| 含密度切换的采样挂载峰值 | 48张，未挂载1000张 |

18次连续自动化滚动步骤从第3页到第20页合计约6201ms，包含自动化和网络等待，**不代表帧率**。密度响应统计只到React布局提交，不是最终绘制时间。没有采集FPS、GPU或跨设备结论。

浏览器自动化点击会先把目标卡片滚入视野，因此不能把点击前位置与关窗后位置直接判为恢复错误。专门记录的查看器打开时 `42018.66796875px`，Escape 后完全相同；另一轮进入编辑器前与返回均为 `42240px`。

客户端池单测验证最大4个并发；服务端日志最高5个缩略图处理请求，包含客户端已取消但服务器仍收尾的重叠请求，二者不是同一个指标。真正原图生成复用既有 render_slot 限制。验收缓存快照17项/539770字节/0临时文件，716次HIT/17次MISS；该快照包含密度及往返操作，不能与“滚动到尾部665次请求”混为同一时间窗口。

## 11. 保护检查、部署与已知限制

`protected-resources.json`：检查93个敏感资源，92个字节不变；唯一变化为 PhotoWorkbench 两处参数类型。将两处类型还原后，完整文件哈希与任务开始一致，确认没有顺带改动编辑器运行时。保护集覆盖模型、迁移、开发数据库、图像算法、草稿服务、编辑器、首页及设计系统视觉资源。

部署注意：

1. 本轮无迁移要求；开发库落后于既有草稿迁移是原状，启用完整草稿功能前需由既有部署流程评估升级，本轮没有自动执行。
2. 本地存储父目录必须可创建同级缓存，容器需把缓存纳入私有可写卷或确保对应父目录持久化；不要公开静态挂载该目录。
3. 缓存可丢弃重建；原图目录不得用作缓存清理目标。原子发布假定同文件系统 rename 语义。
4. 源哈希每次命中仍读取原图，24MP高IO压力或远程文件系统性能未验证；后续可评估可信不可变源版本索引，不能为了性能跳过授权。
5. 前端Blob短期复用可能在权限外部变更或文件外部替换后继续显示已经合法取得的像素，直到闲置失效/刷新/页面退出；新网络请求始终重新鉴权。没有宣称远程撤回已下载像素。
6. 本阶段只有JPEG原图缩略图；历史非JPEG项目显示独立失败卡片，列表仍可导航。OBS明确503，非伪支持。
7. 1000条验证未覆盖5000独立照片、低端设备、长时间浏览器内存剖析及多worker压力；本轮不能据此承诺这些指标。

## 12. 后续 P3-B2 接入点（未实施）

- 扩展 PhotoAsset 白名单及独立持久元数据接口时，继续保持照片授权和分页唯一排序。
- 评分/标签/Pick-Reject 可绑定稳定asset.id及当前选择状态，不能把虚拟DOM是否挂载当作资产状态。
- Light Table 可复用认证图片资源及可取消加载机制，但需单独设计多图内存预算。
- 编辑版本缩略图应增加明确 variant + draft revision 身份，不改变本阶段 original 缩略图语义。
- 若要支持5,000张独立大图或OBS，先建立相应真实环境基准和二进制读取适配，再确定缓存与调度策略。

P3-B1 在此结束，没有自动进入 P3-B2。
