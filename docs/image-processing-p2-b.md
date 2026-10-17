# LensFlow P2-B：非破坏性编辑草稿、自动保存与撤销重做

实施日期：2026-10-17。范围：摄影师 JPEG 工作台的编辑参数持久化、历史栈和并发保护。

## 1. 结论

P2-B 已实现并完成隔离环境验收：真实 JPEG → 恢复草稿 → 本地/服务端预览 → 自动保存 → 刷新和切图恢复 → 撤销重做 → 双标签页冲突处理 → 按当前界面参数导出 JPEG。

- 后端完整回归：**245 passed、1 skipped**，246 项；187.82 秒。
- 前端完整回归：**216 passed**，34 个测试文件；22.95 秒。
- TypeScript、生产构建、P2-B 后端 Ruff 检查通过。
- 前端 lint 命令成功退出，存在 3 条原有警告，均在本任务禁止修改的粒子/Darkroom 文件。
- 完成真实应用浏览器双标签页验收及真实 TCP HTTP 并发写入验证。
- 实际 PostgreSQL 数据库不可用，**未完成 PostgreSQL 在线迁移或并发验收**；只生成并检查了 PostgreSQL 离线 DDL。
- 没有迁移开发数据库，没有改动原图、既有业务模型定义、修图数学算法、首页粒子、Darkroom 或全局设计系统。未安装新依赖。

已停止在 P2-B，没有开发 P3。

## 2. B0 审计与实施边界

### 2.1 实际基础设施

- SQLAlchemy 声明基类：`backend/app/models/base.py::Base`，ID 和时间戳沿用 `IdMixin`、`TimestampMixin`。
- 模型注册：`backend/app/models/__init__.py`；Alembic 的 `backend/alembic/env.py` 使用该模块导出的 `Base.metadata`。
- 修改前迁移 head：`f3a1c2d4e5b6`；新增迁移：`b2d4a6c8e010`，直接连接前一个 head。
- 开发数据库 `backend/storage_local/lensflow.db` 只读查询的实际 revision 为 `5e0b2fd720d3`，本任务前后不变。它与此前代码 head 已有距离，部署前需要核对整个待执行迁移链，不能把本报告理解为已替开发环境迁移。
- 照片授权复用 `backend/app/services/photo_access.py::require_photo_access`：根据持久化 Photo → Order 及当前用户校验归属；草稿操作使用 `write=True`，只允许所属摄影师。
- 文件读取复用 Storage 的只读 `open_read`，不接受客户端路径、storage_key 或 user_id。
- 参数复用 `backend/app/schemas/image_edit.py::EditParameters`，schema_version=1，不新增修图参数。
- 前端沿用认证 Axios、原有照片 Query/页面入口和 UI 组件。草稿的串行写入由每照片独立的 DraftSession 管理，没有用 Query 缓存或 localStorage 代替数据库。

### 2.2 最小必要的结构适配

原来使用 BrowserRouter + Routes，无法直接使用 React Router 的标准 useBlocker。将同一套路由元素交给 createBrowserRouter / RouterProvider，保留既有 URL、保护组件和页面结构。修图页面单独懒加载，最终主包约 480.73 kB（gzip 146.95 kB），没有提升警告阈值来掩盖构建体积。

SQLite 应用连接增加 `PRAGMA foreign_keys=ON`，使新草稿表的真实外键生效。这会执行已有表已声明的外键规则，部署前应排查历史孤立记录和删除流程；完整 SQLite 回归已通过。迁移本身没有重建或修改既有表。

## 3. 修改文件清单

以下路径相对于仓库根目录 `C:/Users/Chase/Desktop/LensFlow`。仓库原本已有大量未提交的 P0/P1/P2-A 和视觉工作，本清单只列 P2-B 变更。

### 后端新增

| 文件 | 职责 |
|---|---|
| `backend/app/models/photo_edit_draft.py` | 独立草稿模型，唯一约束、外键、JSON、revision、源哈希 |
| `backend/alembic/versions/b2d4a6c8e010_photo_edit_drafts.py` | 只创建草稿表及索引，提供对应 downgrade |
| `backend/app/schemas/photo_edit_draft.py` | 严格保存请求及草稿响应 |
| `backend/app/services/photo_edit_draft.py` | 真实源哈希、虚拟默认草稿、数据库条件写入、冲突分类 |
| `backend/app/api/v1/photo_edit_draft.py` | 摄影师认证 GET/PUT 路由 |
| `backend/tests/test_photo_edit_draft.py` | 持久化、权限、输入、源冲突、并发和原图不可变测试 |
| `backend/tests/test_draft_migration.py` | SQLite 升降级、实际约束、PostgreSQL 离线 DDL 检查 |

### 后端修改

| 文件 | 变更 |
|---|---|
| `backend/app/models/__init__.py` | 注册 PhotoEditDraft |
| `backend/app/core/database.py` | SQLite 连接启用实际外键 |
| `backend/app/main.py` | 注册草稿 API；CORS 暴露已有图像指纹/尺寸响应头 |

### 前端新增

| 文件 | 职责 |
|---|---|
| `frontend/src/api/photoEditDraft.ts` | 认证请求、请求/响应类型、响应校验、冲突分类 |
| `frontend/src/components/photo-editor/DraftSession.ts` | 每照片保存状态机、串行队列、过时响应保护 |
| `frontend/src/components/photo-editor/usePhotoDraft.ts` | 会话生命周期和 React 订阅 |
| `frontend/src/components/photo-editor/DraftStatus.tsx` | 轻量保存状态、重试及冲突操作 |
| `frontend/src/components/photo-editor/UnsavedChangesGuard.tsx` | 路由离开与 beforeunload 保护 |
| `frontend/src/components/photo-editor/ParameterHistory.ts` | 50 条参数历史、操作分组、撤销重做 |
| `frontend/src/components/photo-editor/EditorAdjustments.tsx` | 滑块手势和键盘历史操作 |
| `frontend/src/components/photo-editor/DraftSession.test.ts` | 13 项状态机测试 |
| `frontend/src/components/photo-editor/history.test.tsx` | 历史、快捷键、离开提醒测试 |

### 前端修改

- `frontend/src/App.tsx`：同路由数据路由适配及修图页面懒加载。
- `frontend/src/api/imageEdit.ts`：通过 WeakMap 保存预览 Blob 对应的服务端 SHA-256 元数据，不保存像素或新令牌。
- `frontend/src/components/photo-editor/imageResource.ts`、`usePhotoResource.ts`：把可信响应头中的源指纹关联到解码资源。
- `frontend/src/components/photo-editor/PhotoWorkbench.tsx`：等待恢复草稿后启用编辑，连接状态、预览、导出和保护组件。
- `frontend/src/components/photo-editor/EditPanel.tsx`：滑块手势回调及说明文字。
- `frontend/src/components/photo-editor/useServerPreview.ts`：修复撤销返回相同参数时复用已释放 ImageBitmap 的问题。
- `frontend/src/components/photo-editor/previewHooks.test.tsx`：补充元数据 mock 和已释放资源不能复活的回归断言。
- `frontend/src/pages/photographer/PhotoEditorPage.tsx`：说明自动保存和独立照片恢复行为。

交付文档及证据位于本文件和 `docs/image-processing-p2-b/`。临时测试启动/核验脚本位于 `.agentwork/p2-b/`，不参与生产路由或构建。

## 4. 数据库和迁移

`photo_edit_drafts`：

| 字段 | 存储与约束 |
|---|---|
| id | 项目风格整数主键 |
| photo_id | 非空 FK photos.id，ON DELETE CASCADE，索引 |
| user_id | 非空 FK users.id，ON DELETE CASCADE，索引 |
| parameters_json | 非空 JSON，仅已通过 EditParameters 校验的完整参数 |
| revision | 非空 Integer，CHECK >= 0，成功保存后递增 |
| source_sha256 | 非空 String(64)，绑定服务端实际读取字节 |
| created_at / updated_at | 项目时间戳约定；API 返回 UTC 时间 |

唯一约束 `uq_photo_edit_draft_owner(photo_id,user_id)`。默认草稿是 GET 的虚拟响应，不立即插入数据；revision=0。首次成功 PUT 插入 revision=1。

迁移升级只创建新表、2 个索引及约束；降级只移除该表和索引，**会删除草稿数据**，不会删除既有照片/订单/修图版本/交付数据。降级应由部署负责人确认保留策略后执行。本任务仅在隔离数据库执行升降级。

SQLite 迁移测试在旧 head 插入已有用户，升级后比对用户数据和 FK，再降级比对原表集合和用户数据。模型约束检查验证唯一键字段，不依赖反射结果的固定数组位置，并保留 DDL 失败诊断；另有并发创建测试实际验证数据库唯一约束。

## 5. API 契约

保留现有 `/api/v1` 风格、Bearer 鉴权和统一错误 `{code,message,detail}`。

### 5.1 GET /api/v1/photos/{photo_id}/edit-draft

输入：路径中的 photo_id。无任意路径、storage_key、user_id、查询参数。

鉴权：登录且角色为 photographer，并且是照片所属订单摄影师。客户和其他摄影师不得读取该摄影师的草稿；admin 也不绕过此业务限制。

首次响应示例（示例哈希为本次真实 JPEG）：

```json
{
  "photo_id": 1,
  "exists": false,
  "parameters": {"schema_version": 1, "exposure_ev": 0, "contrast": 0, "saturation": 0},
  "revision": 0,
  "source_sha256": "e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a",
  "updated_at": null
}
```

已有草稿返回 exists=true、已保存参数、实际 revision 和最后保存时间。服务器重新计算当前源字节的 SHA-256；已有草稿指纹与源文件不符时返回 412，不下发旧参数供自动恢复。成功响应 `Cache-Control: private, no-store`。

### 5.2 PUT /api/v1/photos/{photo_id}/edit-draft

相同鉴权。整个参数对象保存，不使用参数增量 PATCH。

```json
{
  "parameters": {"schema_version": 1, "exposure_ev": 0.7, "contrast": 25, "saturation": -30},
  "expected_revision": 0,
  "expected_source_sha256": "e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a"
}
```

成功首次响应示例（时间仅示意）：

```json
{
  "photo_id": 1,
  "exists": true,
  "parameters": {"schema_version": 1, "exposure_ev": 0.7, "contrast": 25, "saturation": -30},
  "revision": 1,
  "source_sha256": "e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a",
  "updated_at": "2026-10-17T05:54:24Z"
}
```

下一次更新提交 expected_revision=1，成功由服务器返回 revision=2。客户端不能提交 revision 或 user_id 等未知字段。

参数校验沿用 v1：曝光 [-2,+2] EV；对比度、饱和度 [-100,+100]；默认全部 0；严格拒绝非法类型、NaN、Infinity、越界、未知字段和不支持的 schema_version。expected_revision 必须为严格整数，范围 [0,2147483646]；源指纹必须为小写 64 位十六进制字符串。

### 5.3 错误分类

| HTTP | code / 含义 | 前端行为 |
|---|---|---|
| 401 | UNAUTHORIZED | 沿用认证客户端行为，提示登录 |
| 403 | FORBIDDEN | 无照片编辑权限 |
| 404 | NOT_FOUND | 照片或原图文件不存在 |
| 409 | DRAFT_REVISION_CONFLICT | 保留本地参数，暂停自动保存，提供显式恢复/覆盖 |
| 412 | SOURCE_CHANGED | 阻止旧参数继续提交，不能按 revision 冲突强制覆盖 |
| 413 | IMAGE_TOO_LARGE | 源文件超过现有 byte 上限 |
| 422 | VALIDATION_ERROR | 输入非法，不改变草稿 |
| 503 | STORAGE_UNAVAILABLE / DRAFT_BUSY / DRAFT_WRITE_FAILED | 明确失败，暂停并等待用户重试 |

冲突示例：

```json
{"code":"DRAFT_REVISION_CONFLICT","message":"Draft changed in another session","detail":""}
```

## 6. 乐观锁、源一致性及失败恢复

### 6.1 更新

读取当前行用于判断是否存在和校验源绑定，**版本一致性由数据库条件 UPDATE 决定**：

```sql
UPDATE photo_edit_drafts
SET parameters_json = :parameters,
    revision = revision + 1,
    updated_at = :now
WHERE photo_id = :photo_id
  AND user_id = :current_user_id
  AND revision = :expected_revision
  AND source_sha256 = :actual_source_sha256;
```

rowcount 必须为 1，随后提交事务。为 0 时 rollback 并返回 409。没有使用进程内锁来模拟持久化并发控制；SELECT 不承担最终 revision 比较职责。

### 6.2 首次创建

只有 expected_revision=0 才允许首次创建。两个请求即使同时读到空行，也由数据库唯一约束决定唯一胜者。失败请求捕获 IntegrityError，rollback，再确认竞争行存在后返回 409；其他完整性错误返回 503。数据库忙等 OperationalError 同样 rollback 并返回明确失败。

成功保存回执携带本次成功写入的参数和 revision，不把随后另一个写入者的新版本冒充本次回执。

### 6.3 源绑定

服务端每次使用只读流、256 KiB 分块计算真实 SHA-256，并检查既有文件大小上限；不信任客户端哈希，也不增加源文件缓存。请求指纹和已有草稿指纹均必须等于当前实际源指纹。

前端还将 GET 原始预览的 `X-Source-SHA256` 与 GET 草稿的源指纹比较，避免给不同源的预览应用旧草稿。跨域场景通过 CORS expose_headers 暴露已有图像元数据头；缺失该头时编辑器明确报错，不默认恢复并保存。

这依赖原图只读存储约定；不能对绕过应用、在文件系统中恰好于哈希后替换文件的外部写入提供跨文件系统/数据库原子锁。此类异常仍需运维管控原图不可变策略。

## 7. 前端状态机与历史栈

### 7.1 数据流

认证 JPEG Blob → 解码资源及可信源指纹 → GET 草稿 → 校验参数与源指纹 → 启用工作台 → Canvas 本地预览 / 650ms 服务端校对 → 1000ms 草稿保存。

导出独立读取当前界面的完整参数，继续使用既有服务端全尺寸导出 API 和 saveBlob，不读取旧数据库草稿作为导出参数。

### 7.2 保存状态

- loading / load-error：恢复完成前不允许默认参数发起 PUT。
- saved：当前界面参数与最后确认写入的一致。
- dirty：有新编辑，1000ms 防抖等待保存。
- saving：同一会话最多一个 PUT 在途；继续调整只更新本地最新值。
- error：保存失败，保留参数，暂停自动重试，显示重试按钮。
- revision-conflict：保存暂停；保留本地参数，用户选择加载远端或显式覆盖。
- source-conflict：禁止直接提交/强制覆盖；提示检查原图，必要时作为新 Photo 导入。

保存请求携带参数快照。旧回执只确认自己的快照；在途期间继续编辑不会被旧响应覆盖或误标 saved，上一写入成功后串行提交最新完整参数。传输结果不确定时显式重试仍需条件写入，不能把一次失败推定为成功。

每个 photoId + sourceHash 创建独立会话。切换/卸载时清除计时器、AbortController，并通过生命周期 generation 忽略晚到的 GET/PUT。中止请求并不等于服务器撤销已经开始的事务，界面离开文案明确说明这一点。

显式覆盖：GET 最新 → 核对源 SHA → 使用最新 expected_revision 条件 PUT。若第三个写入者再次抢先，仍显示 409 并暂停，不无限重试。

### 7.3 历史

只保存参数，历史上限 50。指针或滑块键盘手势 start/change/end 归为一项操作；不提供完整手势事件的交互使用 400ms 兜底分组，切换不同滑块会结束上一组。撤销后新编辑清空 redo；重置是可撤销的独立操作。切图或显式加载远端后重建历史，数据库不保存整个历史栈。

支持 Ctrl/Cmd+Z、Ctrl/Cmd+Shift+Z、Ctrl+Y。textarea、非 range input、select、contenteditable 中不截获文字撤销快捷键。撤销/重做继续经过同一参数更新与保存通道。

### 7.4 离开保护和资源修复

useBlocker 提供站内跳转确认；dirty 状态同时注册 beforeunload，卸载移除。beforeunload 只是在浏览器允许时提醒，不能保证最后保存成功，也不保证移动系统强制终止进程时执行。

真实浏览器快速撤销发现原有 useServerPreview 在参数返回旧 key 时，可能重新暴露已在 effect cleanup 中关闭的 ImageBitmap。新增资源 lease 生命周期校验，释放后旧 state 不再作为权威资源返回，先使用本地预览再重新校对；新增对应回归测试。没有修改曝光/对比度/饱和度数学公式或像素处理顺序。

## 8. 实际执行的自动化验证

### 8.1 隔离环境

沿用 fail-closed 的 `backend/tests/conftest.py`：导入应用前设置临时 SQLite、临时 uploads、测试 JWT secret、禁用外部通知；检查 SessionLocal/engine 绑定；每测试创建独立上传目录，结束 drop_all 只作用于临时 DB；会话结束 dispose + 删除自己的 TemporaryDirectory。

实际单独执行隔离验证时的 DB：

`C:/Users/Chase/AppData/Local/Temp/lensflow-pytest-wrpxyvbg/test.sqlite`

上传测试根：同一 `lensflow-pytest-wrpxyvbg` 沙箱下的 cases / uploads-*；**3 passed**，测试退出已清理。完整回归使用同样的随机 TemporaryDirectory 隔离策略，不连接开发数据库执行建表/删表。

### 8.2 后端命令（工作目录 backend）

```powershell
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_draft_migration.py -q
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_photo_edit_draft.py tests/test_photo_access.py -q
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest -q --junitxml=../.agentwork/p2-b/backend-tests.xml
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_isolation.py -v
../.agentwork/design-system/p5-venv/Scripts/python.exe -m ruff check app/models/photo_edit_draft.py app/models/__init__.py app/core/database.py app/main.py app/schemas/photo_edit_draft.py app/services/photo_edit_draft.py app/api/v1/photo_edit_draft.py alembic/versions/b2d4a6c8e010_photo_edit_drafts.py tests/test_photo_edit_draft.py tests/test_draft_migration.py
```

结果：迁移 3 passed；草稿与权限 21 passed；最终完整回归 245 passed / 1 skipped；隔离 3 passed；定向 Ruff All checks passed。

完整回归中唯一跳过：`test_storage_security::test_symlink_cannot_escape`，本 Windows 环境不允许创建测试符号链接。**不能将该项称为通过**。

5 条 warning 是既有 Starlette/httpx 弃用提示及 Alembic path_separator 配置弃用提示。未为消除警告引入依赖或改动部署配置。

开发过程曾出现迁移测试连接未关闭导致 Windows 临时目录清理失败，以及一次唯一约束反射检查失败；已关闭原生 SQLite 连接、改进约束断言和 DDL 诊断，随后迁移定向、前置模块联跑 40 项及最终完整回归通过。早期失败不计入通过结果，失败运行的自有沙箱也已清理。

### 8.3 前端命令（工作目录 frontend）

```powershell
npx --no-install tsc -b
npm run build
npx --no-install vitest run --reporter=default --reporter=junit --outputFile=../.agentwork/p2-b/frontend-tests.xml
npm run lint
```

最终结果：216 passed / 34 files；tsc 与构建成功；lint 命令退出 0，新增代码无 lint 警告。3 条原有警告分别来自 ParticlePortrait 的 effect dependency 及 DarkroomVideoBackground 的两处 effect setState，未修改这些文件。jsdom 中既有 Canvas 未实现/Toast act 提示不等于真实浏览器 Canvas 验收。

新增状态机/历史测试覆盖：默认和保存参数恢复、加载保护、防抖、串行写入、在途继续编辑、旧回执、显式重试、409 暂停/再次冲突、412 阻断、晚到请求、50 条上限、拖动分组、分支清理、可撤销重置、快捷键和离开保护。图像资源测试补充释放后的预览不能因 undo key 相同而复活。

## 9. 真实浏览器与 HTTP 端到端验收

此节是 **实际浏览器和实际 SQLite/HTTP**，与上一节 mock/jsdom 测试分开。

### 9.1 测试环境与样本

- 实际前端：`http://127.0.0.1:4228`，只在临时 Vite 配置中将 `/api` 代理到隔离后端。
- 实际后端：`http://127.0.0.1:8028`，运行真实 FastAPI 应用，使用新迁移 head 建库。
- 实际 DB：`C:/Users/Chase/AppData/Local/Temp/lensflow-p2b-browser-dqqvyr7y/browser.sqlite`。
- 实际 Storage：`C:/Users/Chase/AppData/Local/Temp/lensflow-p2b-browser-dqqvyr7y/uploads`。
- 摄影师为专门创建的隔离测试账号；不使用真实用户资料或令牌。
- 样本为已有真实摄影 JPEG `backend/tests/fixtures/grace_hopper.jpg`（517×606），另生成同一真实照片的 1551×1818 尺寸副本用于第二照片状态隔离。不是 NumPy 合成图片。
- API 请求证据只记录草稿/导出参数及状态，未记录登录密码或 JWT。

### 9.2 浏览器步骤与结果

| 步骤 | 实际观察 | 结果 |
|---|---|---|
| 登录摄影师并打开照片 1 | 真实 JPEG、默认参数、已保存虚拟初态 | 通过 |
| 调整曝光 0.7、对比度 25、饱和度 -30 | 本地像素更新，服务端校对，随后已保存 | 通过 |
| 刷新 | 三项参数恢复 0.7 / 25 / -30 | 通过 |
| 切照片 2 再回 1 | 照片 2 默认值；照片 1 恢复自身草稿 | 通过 |
| 曝光改为 1 → 撤销 → 重做 | 0.7 → 1，Canvas 无资源异常，保存状态正常更新 | 通过 |
| 第二标签页读取同一 revision | 恢复同一草稿，但独立会话历史 | 通过 |
| 第一标签页改对比度 26 并保存；第二页改 -20 | 第二页 409、保留 -20、自动保存暂停，无静默覆盖 | 通过 |
| 第二页显式本地覆盖 | HTTP 先 GET 后使用最新 revision PUT，成功保存 -20 | 通过 |
| 第一页用旧 revision 再编辑 | 再次冲突，未覆盖第二页 | 通过 |
| 冲突状态切换照片 | 出现未保存提醒，选留在当前页面后仍保留参数 | 通过 |
| 第一页加载远端 | 恢复远端 1 / -20 / -30，历史重建 | 通过 |
| 第一页饱和度改 -45 并保存 | 数据库草稿为 -45 | 通过 |
| 第二页本地 -31，旧 revision 导致冲突后导出 | 下载采用 -31，数据库仍 -45 | 通过 |
| 下载内容校验 | JPEG 517×606；与相同参数服务端导出字节完全相同 | 通过 |
| 两张原图 SHA-256 核对 | 与 fixture/初始副本完全一致 | 通过 |

下载文件：`C:/Users/Chase/Downloads/photo-1-edited (1).jpg`。未覆盖既有 P2-A 下载。

源照片 1 SHA-256：`e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。

源照片 2 SHA-256：`133b9efec2b96f338e75b2737fbbf2fa2c7f2da232284d7b62818a33f6c30db8`。

### 9.3 独立真实 HTTP 并发

对照片 2 使用两个线程经真实 TCP 向 Uvicorn 提交相同 expected_revision：

- 首次创建 revision 0：HTTP 状态 **[200,409]**，数据库只有一行且为胜者完整参数，revision=1。
- 更新 revision 1：HTTP 状态 **[200,409]**，数据库仍只有一行且为胜者参数，revision=2。

这补充了单元测试中的 TestClient 并发验证；不是进程内字典或 mock 锁。

### 9.4 实际截图与证据

已保存工作台：

![已保存的真实工作台](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p2-b/saved-workbench.png)

双标签页的 revision 冲突：

![本地参数保留并暂停自动保存](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p2-b/revision-conflict.png)

离开提醒：

![未保存修改的站内离开保护](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p2-b/unsaved-navigation.png)

证据文件：

- `docs/image-processing-p2-b/browser-verification.json`：真实 HTTP 并发、下载字节/尺寸及原图哈希。
- `docs/image-processing-p2-b/http-events.json`：真实页面草稿/导出请求序列与请求参数。
- `docs/image-processing-p2-b/browser-final-state.txt`：实际页面 AX 状态，含冲突、当前本地参数及导出反馈。
- `docs/image-processing-p2-b/protected-resources.json`：63 个受保护文件核对摘要。
- `docs/image-processing-p2-b/cleanup.json`：临时环境清理结果。

验收后关闭两个自建测试标签页、停止临时 Vite 和 Uvicorn。临时后端 finally 中 dispose engine，原有 TemporaryDirectory 已实际删除；未关闭用户原有标签页或停止用户自己的服务。

## 10. 不变性与已知限制

1. 63 个预先记录哈希的文件中，只有预期的模型注册 `backend/app/models/__init__.py` 变化。既有 Photo/Order/RetouchVersion/Delivery 模型、两端修图算法、首页、粒子/材质/效果/UI 目录、Darkroom、package.json/lock 均保持任务开始时状态。
2. 开发 SQLite 文件 SHA-256 与任务前一致，revision 仍为 5e0b2fd720d3。测试操作不意味着开发环境已具备草稿表；正式启用前需要受控备份、核对待执行迁移链并部署新 head。
3. PostgreSQL 只有离线 DDL 验证，没有在线升降级/真实并发实测；不能宣称 PostgreSQL 验收通过。
4. 当前 Windows 符号链接逃逸测试被操作系统限制跳过，需在允许符号链接的 CI/系统补跑。
5. 本次真实浏览器为桌面 in-app browser；没有完成 Safari/Firefox、移动端和系统强制终止进程的验收矩阵。beforeunload 注册/清理有单元测试，站内提醒有真实浏览器测试；没有声称所有浏览器关闭提示都被实测。
6. 源文件发生变化时安全阻断，但本阶段没有“重新绑定旧草稿到新源”或删除草稿接口。不能强制绕过 412；应检查源文件，必要时作为新照片重新导入。
7. 未引入离线草稿恢复或额外令牌存储。关闭前尚未保存的编辑仍可能丢失；已有认证方案未变。
8. 历史栈只在当前页面内存中，刷新、切图或显式加载远端后重新开始；数据库保存当前完整参数，不保存 50 条历史。
9. 每次草稿操作计算有界源 SHA-256，会有额外存储读取成本；尚未进行大型并发压测。不能以此替代未来的不可变对象版本标识/可信服务端缓存设计。
10. 预览数学和 P2-A 的视觉误差界限没有变化；P2-B 未重新声称逐像素跨引擎等价。真实浏览器验证了本地与服务端预览正常更新，旧 P2-A 算法测试完整回归。
11. 草稿不会自动发布成 RetouchVersion、Delivery 或覆盖 Photo.storage_key；正式发布流程维持既有业务语义。

## 11. 下一阶段 P3 建议（仅建议，未实施）

优先补 PostgreSQL 在线迁移及真实并发 CI、部署前历史外键完整性检查、跨浏览器离开保护与快速手势回归。之后再单独设计正式修图版本发布与草稿关系、源变化后的显式恢复流程及服务端不可变对象版本策略。裁剪、旋转、RAW、AI 或批量处理应各自立项并先扩展版本化参数契约，不混入本阶段。
