# LensFlow P3-A — Professional Geometry Editing Pipeline

日期：2026-10-17。仓库：`C:/Users/Chase/Desktop/LensFlow`。实施范围：非破坏性几何编辑及其与已有 JPEG、草稿、历史管线的集成。

## 1. 结论和交付状态

### 已编码并测试

- 自由裁剪，1:1、3:2、4:3、16:9 固定物理宽高比裁剪。
- Canvas 图像上的裁剪框移动、8 个边缘/角点控制点、三分参考线、框外遮罩、应用/取消、重置。
- 顺/逆时针 90°、180° 旋转，水平/垂直翻转，几何重置。
- 明确的 v2 参数契约、v1 兼容解析、完整参数快照保存。
- 后端原尺寸整数几何处理、受保护预览与全尺寸 JPEG 导出。
- 原有 DraftSession 自动保存、revision 并发冲突、源哈希绑定、撤销/重做和离开保护集成。
- 旋转/翻转已有裁剪时保留其对应内容，不静默清空裁剪。
- 后端实际生成的前后端一致性向量、完整回归和实际浏览器验收。

最终结果：后端 **290 passed / 1 skipped**；前端 **249 passed / 38 files**；TypeScript 和生产构建通过；修改模块 Ruff 检查通过。前端 lint 成功退出，保留粒子/Darkroom 中原有的 3 条警告。

### 已编码但尚未完整验证

Pointer Events 已统一鼠标/触摸坐标和 pointer capture；已完成 jsdom Pointer 测试及桌面实际鼠标拖动，但没有实际触屏设备验收。现有 24MP 上限与单 worker 处理槽位保留；未做 24MP 峰值内存或多 worker 压力测试。

### 环境受限无法验证

- 当前 Windows 不允许创建测试符号链接，既有 `test_symlink_cannot_escape` 跳过；不能称其通过。
- 没有实际 PostgreSQL 在线环境。本阶段没有新增迁移，v2 写入既有 JSON 字段；未宣称 PostgreSQL 在线并发/迁移验收通过。
- 未进行 Safari、Firefox、真实移动端或多设备 DPR 浏览器矩阵；DPR 1/2/3 的坐标稳定性有组件测试。

### 未实现

任意角度旋转、透视、RAW/DNG、HSL/曲线/局部蒙版、修复画笔、AI、批量处理、新发布流程、Delivery 改造。没有进入 P3-B/P3-C。

## 2. Inspect 审计结果与变更边界

- v1 后端 Schema 为 `backend/app/schemas/image_edit.py::EditParameters`：严格有限数字，曝光 [-2,2] EV，对比度/饱和度 [-100,100]，默认 0，未知字段禁止。
- 前端 `frontend/src/utils/imageEdit.ts` 负责验证、参数 key 和既有线性 sRGB 调色。新增版本/几何适配；调色公式和处理顺序保留。
- `backend/app/services/image_editor.py` 原有解码过程已做 EXIF Orientation、ICC→sRGB、输入字节/像素限制；预览/导出通过同步 FastAPI handler 在线程池执行。
- GET preview 是不带编辑的认证基图；POST preview/export 读取同一原图与参数。保留现有 API 路径和鉴权。
- PhotoEditDraft 的 parameters_json 本身是 JSON，无需数据库迁移。schema/service 改为接受联合版本，model 和 revision 条件写入逻辑保持原样。
- DraftSession 保存完整参数快照；旧 editsKey 原来只包含三个调色字段，现在扩展为版本、调色及全部几何字段，避免几何变化被误判为未修改。
- 历史栈原本存储参数对象，没有固定的字段枚举，但浅拷贝需要改为验证后的深层几何快照。
- Canvas 原来使用 512/1024 的预览 backing pixels，CSS 尺寸用于适应与缩放；没有通过 DPR 改变参数。现继续分离 backing pixels 与实际图片的 CSS 边界。
- 路由仍为 `/orders/:id/photos/:photoId/edit`，未增加页面路由或改变全局导航。
- 工作区已有大量未提交的历史工作，未 reset/clean，也未覆盖这些修改。
- 迁移链 head 仍为 `b2d4a6c8e010`；开发数据库只读核对仍为 `5e0b2fd720d3`。本次不执行任何开发数据库迁移。
- 测试沿用导入前配置临时 SQLite/存储、隔离后台会话与通知的 fail-closed fixture。

先完成并测试契约/纯函数，再完成后端定向回归，然后接 UI、保存与真实浏览器。最初前端视口尺寸断言及指针浮点表示断言失败已修复后重新运行；没有删除测试或放宽像素几何断言。最终完整回归记录以本报告中的 JUnit 为准。

## 3. v2 契约和 v1 兼容

```json
{
  "schema_version": 2,
  "exposure_ev": 0.7,
  "contrast": 25,
  "saturation": -30,
  "geometry": {
    "rotation_quadrants": 1,
    "flip_horizontal": false,
    "flip_vertical": false,
    "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}
  }
}
```

| 字段 | 默认值与校验 |
|---|---|
| schema_version | 严格整数 1 或 2，保留 v1；缺省版本的旧 API 请求按 v1 解析 |
| exposure_ev | 默认 0 EV；[-2,2]，严格有限数字 |
| contrast / saturation | 默认 0；[-100,100]，与原算法含义一致 |
| geometry.rotation_quadrants | 默认 0；严格整数 0–3；1 = 顺时针 90°，2 = 180°，3 = 顺时针 270° |
| geometry.flip_horizontal / flip_vertical | 默认 false；严格布尔；在旋转后的坐标轴上执行 |
| geometry.crop | 默认 null；表示不裁剪；否则为完整归一化矩形 |
| crop.x / y | 严格有限数字 [0,1]，位于变换后图像的左上角边界 |
| crop.width / height | 严格有限数字 (0,1]；x+width≤1、y+height≤1 |

各层均拒绝未知字段、NaN、Infinity、非法类型和越界值，不接收路径、storage_key 或可信尺寸输入。

后端保留独立的 `EditParameters` v1，新增 `EditParametersV2`、`GeometryParameters`、`CropRectangle` 和 `parse_edit_parameters` 适配。缺省版本会先显式归入 v1，不能因为带 geometry 字段而偷偷推断为 v2。明确 v2 的请求可以省略 geometry 并使用恒等默认；响应会展开完整字段。前端对 v2 完整编辑状态做严格校验。

v1 草稿打开后仍保持 v1：前端通过 `geometryOf` 取得恒等几何，不发 PUT；`normalizeEdits` 在实际编辑提交时生成完整 v2，并保留原有调色。没有批量升级已有草稿。升级仍提交同一个 expected_revision 和 expected_source_sha256，不能绕过 409/412。

旧测试中“未来版本非法”的样例由 schema_version=2 更新为 3，422 断言保留；新增 v2 正常接受、处理和持久化测试。原 v1 像素测试向量完整保留。

## 4. 坐标系、操作顺序与舍入

### 4.1 固定顺序

1. 解码原始 JPEG，应用既有安全上限。
2. EXIF Orientation 归一化一次。
3. 输入 ICC 转为 sRGB，清除失效元数据。
4. 顺时针四分之一圈旋转。
5. 在旋转后的轴上水平/垂直翻转。
6. 在此图像坐标系中裁剪。
7. 曝光 → 以 18% 灰为中心的对比度 → Rec.709 饱和度，沿用原算法。
8. 编码新的 sRGB JPEG，不保留失效的 Orientation。

v2 preview 先在原始归一化尺寸上完成几何和裁剪，再降采样到目标最长边，再执行调色。export 从原图重新开始，不执行预览降采样。v1 路径保持原有行为。

### 4.2 像素边界

旋转后奇数象限交换宽高。设旋转/翻转后图像为 W×H：

```text
left   = floor(x * W)
top    = floor(y * H)
right  = ceil((x + width) * W)
bottom = ceil((y + height) * H)
```

- 计算左上和右下边界，而非单独 round(width*W)。
- 缩放结果离最近整数不超过 `1e-9` 像素时先吸附至该整数，消除 0.3+0.6 等浮点表达造成的虚假一像素扩张。
- left/top 限制在 [0,W-1]/[0,H-1]。
- right/bottom 限制到图像边界且至少为 left+1/top+1。
- 使用右/下边界不包含的 Pillow/Canvas 像素区间，保证至少 1×1；不允许空输出。

前端 `pixelCropBox` 与后端 `pixel_crop_box` 使用相同规则，向量测试不允许位置误差。

### 4.3 固定比例

固定比例 r 表示实际图片像素的宽/高，而非归一化 width/height。归一化目标比例为 `r * H / W`，在当前框中取能够容纳的最大比例矩形并居中。拖动时以对侧边/角为锚点，限制到图片范围。

归一化几何严格满足固定物理比例；整数输出仍遵循共同的向外边界舍入。任意非整数边界不一定产生严格整数 3:2：单边最多不足 1 像素向外包含，宽/高总扩张各最多不足 2 像素。不能通过分别修改后端区域来偷偷纠正宽高比。实际浏览器样例的 3:2 区域输出 548×365，属同一明确舍入规则；测试中的整像素 3:2、16:9 区域输出则严格为对应整数比例。

### 4.4 已裁剪后旋转/翻转

裁剪记录在全图变换后坐标中。右旋一次时：

```text
x' = 1 - y - height
y' = x
width' = height
height' = width
```

同时 q=(q+1)%4，并交换水平/垂直翻转标志，使旋转作用于当前已变换的图片。左旋等价于三次右旋。水平翻转将 x 改为 1-x-width，垂直翻转类似处理 y。

纯函数测试对 4 个象限 × 4 种翻转组合分别验证：先裁剪结果再旋转/翻转，与变换参数/裁剪框后从原图计算的整数像素内容完全相同。

## 5. 前端 Canvas 与交互

### 5.1 结构

- `GeometryPanel` 提供旋转/翻转/裁剪及重置，复用现有 Button、颜色令牌和中性视口。
- `CropOverlay` 只覆盖在图片 wrapper 的真实 CSS 范围内，不覆盖整个含留白的 viewport。
- 裁剪外罩、控制点和参考线是独立 DOM，永远不进入 Canvas 输入或 JPEG 导出。
- 非裁剪模式显示真正裁剪后的 Canvas/服务端结果；重新开启裁剪时使用完整的已旋转/翻转基图，并恢复原裁剪框。
- 裁剪临时状态只包含矩形和比例，不是第二套持久编辑状态。确认后调用同一个历史/草稿通道；取消/Esc 丢弃临时状态。
- 24px 控制点命中区，支持鼠标/触摸 Pointer Events、pointer capture、方向键按原尺寸 1px 调整（Shift 为 10px）。
- 指针取消恢复当前手势起点；全局取消不提交裁剪。不截获文字输入中的撤销键。

### 5.2 缩放、DPR 与原尺寸 ROI

指针坐标通过图片自身的 getBoundingClientRect 转成 [0,1]，不使用 Canvas backing size、容器留白或 DPR 倍率。ResizeObserver 和缩放仅改变 CSS 布局，已保存归一化框不变。

认证 GET preview 增加 `X-Source-Width` / `X-Source-Height`，表示 EXIF/ICC 规范化后的原尺寸，并通过 CORS expose_headers 暴露；它们与原有源 SHA-256 共同关联到解码资源。没有把照片表中可能尚未规范化的尺寸或客户端传入尺寸作为后端可信输入。

`canvasGeometry` 先在 512/1024 交互基图上做实际整数旋转/翻转。裁剪时，`previewCropWindow` 使用**原尺寸定义的整数 ROI**，按比例映射为低分辨率纹理上的小数采样窗口，避免在低分辨率图上再次向外取整形成不同裁剪区域。CSS 图片宽高比同样取原尺寸 ROI。临时 Canvas 在 finally 清空并释放 backing buffer。

低分辨率纹理仍不能恢复原图的细节；浏览器 JPEG 解码、双重预览采样与 Pillow/LANCZOS 可能有颜色/插值差异。这不改变裁剪 ROI 契约，最终以服务端权威预览为准，不宣称所有显示像素与全尺寸导出逐像素相同。

### 5.3 性能与资源

- 本地继续 RAF 合并像素绘制，先用最长边 512；停止更新 160ms 后细化至 1024。
- 裁剪拖动只通过 RAF 更新框，不反复处理照片像素，也不逐帧请求服务端。
- 裁剪模式暂停新的服务端预览；应用后沿用 650ms 防抖校对。
- geometry 加入完整 key，旧几何响应不会覆盖新状态；保留 AbortController、解码后晚到结果释放和已释放 ImageBitmap 的 lease 保护。
- 原图保持只读，不在 localStorage 保存照片像素。现有认证流程不变。

## 6. 草稿、历史与 API 集成

继续使用原 API：

| 接口 | 参数与行为 |
|---|---|
| GET `/api/v1/photos/{photo_id}/preview` | 认证规范化基图，最长边 1–1024，增加可信原尺寸头 |
| POST `/api/v1/photos/{photo_id}/preview` | `{ "edit": <完整 v1 或 v2 参数> }`，服务端几何后降采样 |
| POST `/api/v1/photos/{photo_id}/export` | 同参数，从原图导出 JPEG Blob |
| GET `/api/v1/photos/{photo_id}/edit-draft` | 原照片归属校验后读取 v1/v2，不自动升级 |
| PUT `/api/v1/photos/{photo_id}/edit-draft` | 完整 parameters + expected_revision + expected_source_sha256 |

v2 保存示例：

```json
{
  "parameters": {
    "schema_version": 2,
    "exposure_ev": 0.7,
    "contrast": 25,
    "saturation": -30,
    "geometry": {
      "rotation_quadrants": 1,
      "flip_horizontal": false,
      "flip_vertical": false,
      "crop": {"x": 0.1, "y": 0.1, "width": 0.8, "height": 0.8}
    }
  },
  "expected_revision": 3,
  "expected_source_sha256": "e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a"
}
```

成功仍返回完整 parameters、revision=4、源 SHA 和 updated_at。认证、权限、422、429、文件/像素上限、单处理槽、私有缓存头和异常机制保留。

- 1000ms 防抖、一个在途 PUT、参数快照及旧回执处理继续由 DraftSession 完成。
- 409 保留完整本地 geometry 并暂停保存；显式覆盖必须先 GET 最新 revision 再执行条件 PUT。
- 412 源冲突仍阻断，不能强制覆盖。
- `useEditHistory` 从原 EditorAdjustments 提取，共同管理调色和几何；没有第二个几何历史栈。
- 应用裁剪、旋转、翻转、重置均作为单项操作进入 50 条历史；拖动过程不产生历史；取消不产生历史。
- 历史的几何对象通过验证深拷贝，避免快照共享可变对象。
- 裁剪临时状态存在时保护离开、禁用其他提交操作，隐藏导出，避免导出未确认的框。保存完成与 beforeunload 的既有边界不变。

## 7. 修改文件清单

路径相对于仓库根目录；以下只列 P3-A 变更。

### 后端

新增：

- `backend/app/services/image_geometry.py`：纯尺寸/像素边界计算、Pillow 几何处理及临时图像释放。
- `backend/tests/test_geometry_contract.py`：版本和严格输入、边界规则。
- `backend/tests/test_image_geometry.py`：组合几何、真实 JPEG、EXIF、原图哈希、v1 草稿、权限、预览/导出 ROI。

修改：

- `backend/app/schemas/image_edit.py`：v1/v2 联合解析与几何校验。
- `backend/app/schemas/photo_edit_draft.py`：草稿请求/响应接受联合版本。
- `backend/app/services/photo_edit_draft.py`：读取 JSON 使用兼容解析；SQL 乐观锁保持原逻辑。
- `backend/app/services/image_editor.py`：v2 几何阶段、原尺寸 metadata；调色数学不变。
- `backend/app/api/v1/image_edit.py`：GET 原尺寸响应头。
- `backend/app/main.py`：CORS expose 新增原尺寸头。
- `backend/tests/test_image_export.py`、`test_photo_edit_draft.py`：未来非法版本样例改为 3，保留拒绝断言。

### 前端

新增：

- `frontend/src/utils/imageGeometry.ts`：几何校验、尺寸/边界、参数组合、RGBA 整数变换。
- `frontend/src/utils/previewGeometry.ts`：原尺寸 ROI 到预览采样窗口。
- `frontend/src/components/photo-editor/canvasGeometry.ts`：实际 Canvas 几何和小数窗口采样。
- `frontend/src/components/photo-editor/CropOverlay.tsx`、`cropInteraction.ts`：框、控制点、Pointer/键盘交互与纯拖动函数。
- `frontend/src/components/photo-editor/GeometryPanel.tsx`：工具栏与裁剪应用/取消。
- `frontend/src/components/photo-editor/useEditHistory.ts`：提取统一历史控制逻辑。
- `frontend/src/utils/imageGeometry.test.ts`、`imageGeometryParity.test.ts`、`previewGeometry.test.ts`。
- `frontend/src/components/photo-editor/geometryControls.test.tsx`。
- `frontend/src/utils/__fixtures__/image-geometry-v2.json`：后端实际生成的 16 组向量。

修改：

- `frontend/src/utils/imageEdit.ts`：v1/v2 类型、验证、key、恒等几何适配；原调色公式保留。
- `frontend/src/api/imageEdit.ts`：关联原尺寸头与 Blob。
- `frontend/src/components/photo-editor/imageResource.ts`、`usePhotoResource.ts`：携带原尺寸。
- `PhotoWorkbench.tsx`、`PhotoViewport.tsx`、`EditorAdjustments.tsx`、`ParameterHistory.ts`、`useServerPreview.ts`、`photo-editor.css`：接入上述职责。
- `DraftSession.test.ts`、`PhotoViewport.test.tsx`、`previewHooks.test.tsx`、`controls.test.tsx`：新增 v2 保存、DPR/Resize、过时几何响应与导出快照测试。

其他：`scripts/generate_image_geometry_vectors.py` 可复现向量；本报告及 `docs/image-processing-p3-a/` 保存验收证据。`.agentwork/p3-a/` 与 `p3-a-smoke/` 为本地隔离启动/核验脚本，不参与生产应用。

## 8. 实际测试命令和结果

### 契约与阶段回归

- 后端契约第一轮：17 passed。
- 前端契约与旧调色：21 passed。
- 后端几何、契约、既有导出/草稿定向回归：101 passed。
- 后续几何/安全补充定向：45 passed。
- 前端编辑器与几何定向：85 passed，后续增加组合、DPR 和 ROI 测试后运行最终完整回归。

### 后端完整回归（工作目录 backend）

```powershell
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest -q --junitxml=../.agentwork/p3-a/backend-tests.xml
```

最终：**290 passed、1 skipped、5 warnings，225.60 秒**，共 291 项。跳过项为 Windows 测试符号链接权限限制；警告为既有 Starlette/httpx 和 Alembic path_separator 弃用提示。测试 DB、uploads、后台会话及通知均使用既有隔离 fixture；开发存储前后哈希检查通过。

### 前端完整回归（工作目录 frontend）

```powershell
npx --no-install tsc -b
npm run build
npx --no-install vitest run --reporter=default --reporter=junit --outputFile=../.agentwork/p3-a/frontend-tests.xml
npm run lint
```

最终：**249 passed / 38 files，15.92 秒**；tsc 与 build 成功。主包 480.73 kB / gzip 146.95 kB；修图懒加载块约 31.88 kB / gzip 11.41 kB；未新增大型框架或依赖。

lint 命令退出 0，新增代码无 lint 警告；原有 3 条位于 ParticlePortrait 和 DarkroomVideoBackground，未改动这些文件。jsdom 原有 Canvas 未实现/部分组件测试提示不能代替真实 Canvas 验收，真实测试另列。

### Ruff 与可复现向量（工作目录仓库根）

```powershell
.agentwork/design-system/p5-venv/Scripts/python.exe -m ruff check scripts/generate_image_geometry_vectors.py backend/app/schemas/image_edit.py backend/app/schemas/photo_edit_draft.py backend/app/services/image_geometry.py backend/app/services/image_editor.py backend/app/services/photo_edit_draft.py backend/app/api/v1/image_edit.py backend/app/main.py backend/tests/test_geometry_contract.py backend/tests/test_image_geometry.py
.agentwork/design-system/p5-venv/Scripts/python.exe scripts/generate_image_geometry_vectors.py
```

检查通过；16 组实际 Pillow/NumPy 向量包括不对称奇数图案、真实竖向照片、横向照片、带 Orientation=6 的真实 JPEG，并组合非零调色。几何边界、尺寸和方向断言为精确一致；调色容差预先定为单通道最大 1、平均绝对误差 <0.05（0–255），不以 JPEG 有损为理由放宽几何位置。

## 9. 实际浏览器与真实 HTTP 验收

### 9.1 环境

实际 React 页面：`http://127.0.0.1:4238/orders/1/photos/1/edit`，隔离代理后端 `127.0.0.1:8038`。真实 FastAPI、SQLAlchemy、SQLite、Storage；没有以静态 demo 替代接口。

主轮 DB：`C:/Users/Chase/AppData/Local/Temp/lensflow-p3a-browser-_xuigpmo/browser.sqlite`；存储为同沙箱 uploads。使用已有真实摄影样本 `backend/tests/fixtures/grace_hopper.jpg`（517×606）及其 1551×1818 副本。预置一份 v1 草稿 revision=1 用于验证只读打开。

最终本地 ROI 采样修复后又单独启动 `lensflow-p3a-smoke-chsd28cq` 沙箱，复核大图的 local-live → 服务端校对 → 已保存。两轮临时 DB/存储和服务均已清理；不涉及真实开发目录。

### 9.2 实际步骤

| 步骤 | 结果与证据 |
|---|---|
| 摄影师登录、打开真实 JPEG | 成功显示认证照片 |
| 打开 v1 草稿 | 数据库仍为 schema_version=1/revision=1，HTTP 日志无 PUT |
| 右旋 90° | 图像真实横向，几何参数 q=1 |
| 选择 3:2、拖右下角缩放并拖动框 | 图像区域内按固定比例缩放与移动，产生非平凡归一化框 |
| 应用裁剪、曝光 +0.7 EV | 裁剪框退出，显示实际裁剪照片；自动保存 v2 |
| 刷新恢复 | 曝光、旋转、裁剪恢复 |
| 水平翻转 → 撤销 → 重做 | Canvas 与保存状态同步，最终水平翻转写入草稿 |
| 第二标签页打开相同照片 | 读取同一已保存 geometry |
| 第一页垂直翻转保存；第二页左旋 | 第二页 409，完整本地 geometry 保留 |
| 第二页显式覆盖 | GET 最新 revision 后条件 PUT 成功 |
| 第一页旧版本再次编辑 | 再次 409；选择加载远端后恢复远端 geometry |
| 重新打开裁剪、浅色检查 | 原裁剪范围与数据库坐标一致；浅色控制点/框清晰，照片视口保持中性 |
| 切到照片 2 再回照片 1 | 独立状态，没有串裁剪；恢复 geometry 和 +0.7 EV |
| 浏览器下载 JPEG | 548×365；独立 Pillow 校验实际区域、方向和解码像素 |
| 大图真实 HTTP 导出 | 1456×1241，超过预览上限；相同编辑的 max_side=127 预览为127×108 |
| 原图与业务状态 | 两个源文件哈希/文件集合不变；无额外存储文件，无新增 retouch/delivery 版本 |
| 最终 ROI 修复 smoke | 实际页面观察到 Canvas `data-preview-source=local-live`，随后已显示服务端校对结果并已保存，无渲染错误 |

浏览器下载：`C:/Users/Chase/Downloads/photo-1-edited (2).jpg`，未覆盖以前的下载。

实际浏览器导出区域在变换后的 606×517 图像中为 `[22,71,570,436]`，输出 **548×365**。核验脚本独立用 Pillow 旋转/镜像和直接 floor/ceil 推导区域，再调用已有调色并编码；下载 JPEG 的解码像素与预期 JPEG 精确相同，未引用 image_geometry 来循环证明自身。

大图独立区域为 `[181,155,1637,1396]`，输出 **1456×1241**；同样独立校验像素一致。这证明导出没有把 1024 预览作为最终输入。存储原图 SHA-256 保持：

- 照片 1：`e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。
- 照片 2：`133b9efec2b96f338e75b2737fbbf2fa2c7f2da232284d7b62818a33f6c30db8`。

### 9.3 实际截图

暗色模式固定比例框，真实角点缩放及移动后：

![暗色实际裁剪](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-a/crop-dark.png)

浅色模式重新打开已保存范围（图像方向为测试中主动翻转后的状态）：

![浅色实际裁剪](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-a/crop-light.png)

双标签页 geometry 冲突：

![真实几何冲突](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-a/geometry-conflict.png)

### 9.4 可检查证据

`docs/image-processing-p3-a/`：

- `browser-verification.json`：独立导出核验、完整参数、像素边界、源文件与业务记录检查。
- `http-events.json`：草稿/预览/导出请求参数和状态，不包含密码/JWT。
- `roi-smoke-events.json`、`roi-smoke-state.txt`、`roi-smoke.png`：最终采样实现的大图复核。
- `backend-tests.xml`、`frontend-tests.xml`、`test-summary.json`：最终完整测试结果。
- `protected-resources.json`：66 个受保护文件哈希检查结果。
- `cleanup.json`：两轮沙箱已删除、临时服务与自建标签页已关闭。

## 10. 数据保护和部署边界

66 个预先记录的受保护文件全部哈希不变：既有业务模型、数据库/存储文件、迁移链、首页/粒子/效果/设计系统/Darkroom、依赖清单。没有新的数据库迁移，也没有重写 RetouchVersion/Delivery 语义或 Photo.storage_key。

开发数据库实际 revision 仍为 5e0b2fd720d3；它在任务前就落后于既有 P2-B 代码 head。本次只在沙箱执行既有迁移链。部署 P3-A 前仍需要受控处理 P2-B 草稿表部署，不能把本报告理解为开发或生产已迁移。

## 11. 性能与已知限制

1. 后端保持 20MiB 文件、24MP 像素、12000px 最大边和每 worker 一个昂贵处理槽。整数 transpose/crop 不引入旋转插值；中间图像逐步 close。仍可能在大图转换时同时持有原图和临时 RGB 缓冲，本轮没有承诺 24MP 峰值内存上限或压力测试结果。
2. 为保证 ROI 语义，v2 服务端先处理原尺寸几何再缩小。未来可以在同一坐标编译层加入 ROI 解码/分块优化，但必须保留当前测试向量与边界语义。
3. 本地预览最多1024，放大后不能提供原图级细节；颜色/重采样差异以服务端校对为准。没有通过 CSS transform/filter 冒充几何或调色。
4. 固定比例选择是工具的临时交互偏好，持久化的是最终矩形；重开时显示相同矩形，比例选择恢复为自由，不推断并强制约束用户之前的意图。
5. 历史仍为当前页面有限参数栈，不持久化整个历史。关闭前未保存的修改仍可能丢失；保留 beforeunload 的既有限制。
6. 原图 SHA 冲突不能自动重新绑定；沿用 P2-B 的检查源文件/必要时作为新照片导入策略。
7. 未完成的设备、跨浏览器、PostgreSQL、符号链接和大图压力测试见第一节，没有标记为通过。

## 12. 后续扩展建议（未实施）

下一阶段先补充实际触屏/跨浏览器、允许符号链接的 CI、PostgreSQL JSON/并发集成和24MP内存/延迟基线。若继续向 digiKam 风格编辑演进，应沿用版本化参数、规范化源空间、几何尺寸/ROI 编译层和当前黄金向量；任意角度、透视和蒙版需要独立版本契约及采样/边界策略。正式版本发布、批量和 AI 继续分开立项。

P3-A 完成后停止，无 P3-B、RAW、AI 或 digiKam C++ 移植实现。
