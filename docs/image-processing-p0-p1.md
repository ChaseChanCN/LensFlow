# LensFlow P0/P1 安全 JPEG 图像处理闭环

日期：2026-10-17。范围：后端能力与自动化测试，不包含修图 UI。

## 1. 实现结论

保留 FastAPI、SQLAlchemy、既有 Photo/Order 和 Storage 架构，打通：

**注册/登录认证 → 订单归属校验 → 读取真实 JPEG → 方向与色彩归一化 → 低分辨率预览 → 参数化像素处理 → 新 JPEG Blob 导出。**

没有新增依赖、数据库表或迁移；没有修改首页、粒子动画、设计系统或业务模型。

## 2. 安全修复

### 2.1 注册权限

公开注册请求 `UserRegisterRequest.role` 仅接受 `client`、`photographer`，默认 `client`。提交 `admin` 返回 422。既有普通用户登录、JWT 与启用状态校验继续使用原实现。

管理员只能由拥有受信任服务器终端/数据库访问权限的操作员执行：

```powershell
# 工作目录：backend；使用后端实际 Python 虚拟环境
python -m scripts.create_admin --email operator@example.com --name Operator
```

密码通过 getpass 输入两次，不进入命令行参数；已有邮箱将被拒绝，不会把普通账户提升为管理员。该命令不会创建数据表。限制新注册不代表撤销数据库中原有的 admin；历史管理员应由运营人员核实来源。

### 2.2 对象归属

统一函数位于 `backend/app/services/photo_access.py`：

- `require_order_access`：从数据库加载 Order，核实订单摄影师或客户。
- `require_photo_access`：从 photo_id 加载 Photo，再使用持久化的 Photo.order_id 核实 Order。
- 预览允许订单摄影师与该订单客户；导出只允许订单摄影师。
- 无管理员通用绕过；其他订单用户返回 403。
- Photo/Order 不存在返回 404。
- 上传、照片列表、删除、分析读取、分析复核也接入上述校验。
- 删除路由中的 order_id 只做关联一致性检查，不单独作为授权依据。

新接口不接收任意路径或 storage_key；未知编辑字段和查询参数拒绝为 422。

### 2.3 存储

Storage 增加兼容的 `open_read` 上下文方法，本地实现只以 rb 打开文件；路径解析后必须位于配置的存储根目录内。拒绝父路径、绝对路径、Windows 盘符、反斜杠、空字节、冒号及解析后逃逸的链接目标。保存仍使用服务端 UUID，改为 xb 独占创建。

既有 OBS 保留原架构，但本阶段未实现/验证其二进制读取。未提供该能力的后端明确返回 503，不请求公开 URL，也不把 URL 当作本地路径。当前实际端到端验收使用本地 Storage；OBS 上线前需要另行接入并验证受认证的 SDK 流式读取。

存储目录应只允许服务端受信任进程写入；这不是操作系统文件隔离或对恶意本机进程替换目录的防护方案。

## 3. API

### 3.1 原始预览

```http
GET /api/v1/photos/123/preview?max_side=1024
Authorization: Bearer <access_token>
```

- photo_id 引用数据库中的照片。
- max_side：整数 1–1024，默认 1024，不放大小图。
- 鉴权：订单摄影师或订单客户。
- 成功：200，`Content-Type: image/jpeg`，真实 JPEG 二进制。
- 像素方向：先应用原图 EXIF Orientation，再等比例缩小，最长边不超过 max_side。

### 3.2 参数预览

```http
POST /api/v1/photos/123/preview?max_side=1024
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "edit": {
    "schema_version": 1,
    "exposure_ev": 0.7,
    "contrast": 25,
    "saturation": -30
  }
}
```

鉴权与原始预览相同。缩小后应用同一版本的像素处理算法，返回 200 JPEG；不会保存编辑状态或覆盖源文件。此接口供权威校对，不建议每次滑块事件都调用。

### 3.3 导出

```http
POST /api/v1/photos/123/export
Authorization: Bearer <photographer_access_token>
Content-Type: application/json

{
  "edit": {
    "schema_version": 1,
    "exposure_ev": 0.7,
    "contrast": 25,
    "saturation": -30
  }
}
```

- 只允许所属订单摄影师。
- 保持应用 EXIF 后的全尺寸，不使用预览图作为导出输入。
- 返回 200 JPEG Blob；`Content-Disposition: attachment; filename="photo-123.jpg"`。
- 空对象 `{}` 或 `{"edit":{}}` 使用全部默认值；请求体本身不能省略。
- 不保存导出文件，不修改 Photo.storage_key，不新增 RetouchVersion。

### 3.4 成功响应头

```http
Content-Type: image/jpeg
Cache-Control: private, no-store, max-age=0
Pragma: no-cache
Vary: Authorization
X-Content-Type-Options: nosniff
X-Image-Width: 517
X-Image-Height: 606
X-Source-SHA256: <源文件字节的 SHA-256>
X-Render-Version: 1
```

既有 CORS 中间件还可能向 Vary 添加 Origin。自定义响应头若需前端跨域读取，需要配置 CORS expose_headers；JPEG Blob 本身不受该自定义头暴露限制。

### 3.5 错误

沿用项目 `code/message/detail` 的 AppException 格式，新图像路由把 Pydantic 错误转换为同一格式，避免 NaN/Infinity 在 JSON 错误序列化阶段变成 500；其他路由的校验格式不变。

```json
{
  "code": "VALIDATION_ERROR",
  "message": "Validation failed",
  "detail": "body.edit.exposure_ev: Input should be less than or equal to 2"
}
```

| HTTP | 场景 |
|---|---|
| 401 | 未认证、无效令牌或已禁用用户，沿用现有认证 |
| 403 | 角色或照片所属订单不允许访问 |
| 404 | 照片、订单或源文件不存在 |
| 413 | 读取字节、解码像素数或单边尺寸超限 |
| 415 | 实际格式不是 JPEG，或是本阶段不支持的 CMYK 等色彩模式 |
| 422 | 损坏/截断 JPEG、无效 ICC、非法参数或存储 key |
| 429 | 当前进程的图像处理槽位占用，请稍后重试 |
| 503 | 存储暂不可用或没有实现受认证二进制读取 |
| 500 | 未预料的编码/运行失败；不会返回成功 JPEG |

旧上传入口维持既有空文件/MIME/字节超限的 422 行为；新增解码尺寸限制返回 413。不会仅凭文件扩展名或客户端 MIME 认定为 JPEG。

## 4. 参数与算法

所有参数由 `backend/app/schemas/image_edit.py` 的 Pydantic 模型验证，拒绝未知字段。

| 字段 | 类型与范围 | 默认值 | 含义 |
|---|---|---|---|
| schema_version | 严格整数，当前仅 1 | 1 | 算法契约版本，拒绝 true 和字符串 |
| exposure_ev | 有限 JSON 数字，[-2,2] | 0 | EV；线性 RGB 乘以 2^EV |
| contrast | 有限 JSON 数字，[-100,100] | 0 | 无量纲；围绕线性 18% 灰调整，增益为 2^(contrast/100) |
| saturation | 有限 JSON 数字，[-100,100] | 0 | 无量纲；-100 为灰度，+100 为两倍色度偏差 |

数字字段接受整数与浮点数，拒绝字符串、布尔、null、数组、NaN 和 Infinity。

固定处理顺序：

1. 检查源字节大小及 JPEG 文件头中的尺寸；在像素加载前执行像素数/单边限制。
2. 严格加载 JPEG，拒绝截断文件，应用 EXIF Orientation。
3. 有有效 ICC 的 RGB/灰阶 JPEG 转到 sRGB；无 ICC 视作 sRGB。无效或超过 1 MiB 的 ICC 拒绝；CMYK 本阶段拒绝。
4. 预览：用 Lanczos 等比例缩小；导出：保留全尺寸。
5. 归一化 sRGB 通道到 [0,1]，按标准分段传递函数转为线性 RGB。
6. 曝光：`C = C * 2^exposure_ev`。
7. 对比度：`C = (C - 0.18) * 2^(contrast/100) + 0.18`。
8. 亮度：`Y = 0.2126R + 0.7152G + 0.0722B`；饱和度：`C = Y + (C - Y) * (1 + saturation/100)`。
9. 最后裁切至 [0,1]，转回 sRGB，以 NumPy rint 舍入到 uint8。
10. Pillow 编码 JPEG，quality=90、4:4:4（subsampling=0），嵌入目标 sRGB ICC。

三个调整均为 0 时直接跳过浮点运算，避免额外量化。JPEG 仍会重新编码，因此不承诺与原始压缩字节相同；测试要求与同一规范化编码基图解码像素一致，并另行验证与真实摄影原图的 RMSE <3。

EXIF/GPS、原始方向标签和注释不复制到输出。原始文件中的这些信息不变。当前不是摄影元数据无损归档方案。

## 5. 性能、失败与生命周期

- 默认字节限制：20 MiB；像素限制：24,000,000；单边限制：12,000。
- 配置键：IMAGE_MAX_BYTES、IMAGE_MAX_PIXELS、IMAGE_MAX_DIMENSION，已写入 backend/.env.example。
- 新预览/导出处理函数及上传采用同步 def 路由，FastAPI 在线程池中执行，不阻塞异步事件循环。
- 新处理管线和上传验证每个 worker 同时只接受一个图像处理操作；超出立即 429。不是持久任务队列，多进程需要按 worker 数评估内存。
- 像素调整分 128 行处理 float32 数据，避免生成多份全图 float32 数组；JPEG 解码与归一化仍需要整图内存。
- 源文件 rb、归一化 Image、条带图像与 BytesIO 都用上下文释放；导出结果只在响应内存中存在，没有导出临时文件需要清理。
- 既有质量分析后台任务复用隔离后的 SessionLocal，并使用 Storage.open_read；失败分支先 rollback 再写 need_review。
- 既有 OpenCV 后台分析的调度/内存策略没有重构。本阶段没有做 2400 万像素并发压力测试，不承诺生产容量。

## 6. 自动化验收与真实样本

真实摄影样本：backend/tests/fixtures/grace_hopper.jpg，517×606，73,746 字节。

它是 James S. Davis / US Navy 拍摄的 Grace Hopper 官方照片，来源与公共领域说明见 fixtures/README.md；测试离线运行，不依赖图片网络请求。

源 SHA-256：`e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。

覆盖：

- 普通注册/登录、公开 admin 注入与独立管理员创建。
- 持久化 Photo→Order 归属、未认证、跨订单读取/导出。
- 真实 JPEG 预览、缩小上限、EXIF 方向、ICC、截断文件、伪 JPEG。
- 字节数、像素数、单边限制，验证超限时不会进入像素 load。
- 三种参数分别产生真实像素变化，零参数保持规范化基图一致。
- 无效类型/范围/版本、全部参数的 NaN/Infinity。
- 原始文件哈希与 storage_key 不变，无导出文件残留。
- 连续处理不同照片不串状态。
- 处理繁忙时 429、异常后槽位恢复、处理期间异步 /health 可响应。
- 注册→真实登录→预约/订单→上传真实 JPEG→预览→编辑导出的 HTTP 全流程。
- 每项测试独立上传目录，后台 SessionLocal 与请求使用同一测试数据库；通知发送 mock。
- 每测试结束删除其上传目录；会话结束释放引擎并删除整个沙箱，未删除则报错。
- 会话前后只读计算开发 storage_local 的文件集合/哈希，不通过 SQL 连接开发数据库。

### 实际执行结果

运行目录为 `backend`，实际 Python 为仓库已有的 `.agentwork/design-system/p5-venv/Scripts/python.exe`（Python 3.12.10，pytest 9.1.1），未安装新依赖。

```powershell
$python = "../.agentwork/design-system/p5-venv/Scripts/python.exe"
& $python -m pytest tests/test_isolation.py -v
& $python -m pytest tests/test_auth.py tests/test_registration_security.py tests/test_photo_access.py -v
& $python -m pytest tests/test_storage.py tests/test_storage_security.py -v
& $python -m pytest tests/test_image_preview.py tests/test_photos.py -q
& $python -m pytest tests/test_image_export.py -v
& $python -m pytest tests/test_image_preview.py tests/test_image_export.py tests/test_isolation.py tests/test_photo_access.py -q
& $python -m pytest -v --junitxml=../.agentwork/p0-p1/backend-tests.xml
```

| 验证范围 | 实际结果 |
|---|---|
| 隔离基础检查 | 3 passed |
| 注册、登录与照片归属 | 23 passed |
| 存储与路径防护 | 16 passed, 1 skipped |
| 预览及旧照片接口回归 | 26 passed |
| 初版导出专项 | 37 passed |
| 补充测试后的图像/归属/隔离专项 | 60 passed |
| 最终完整后端回归 | **223 passed, 1 skipped, 1 warning，161.45 秒** |

一次预览专项的首次收集因测试 fixture 导入路径不正确而失败；改正后，测试又发现既有 CORS 会把 Origin 加入 Vary，已修正过严的测试断言。以上表格列出修正后的实际通过结果，不把首次运行计为通过。

最终完整测试数据库：
`C:/Users/Chase/AppData/Local/Temp/lensflow-pytest-8p462k2f/test.sqlite`。

对应逐测试上传路径形如：
`C:/Users/Chase/AppData/Local/Temp/lensflow-pytest-8p462k2f/cases/<test_name>/uploads-<random>/`。

会话结束后该根目录已删除并检查不存在。存储单元测试原有 TemporaryDirectory fixture 也会在作用域退出时清理其独立系统临时目录。

唯一跳过项为 `test_symlink_cannot_escape`：当前 Windows 不允许创建测试符号链接；不能据此宣称在真实符号链接上已通过验证。其他路径逃逸测试均通过。

唯一警告来自既有 Starlette TestClient 对 httpx 的弃用提示；未因此变更依赖。

对本次涉及的 18 个 Python 文件运行 `python -m ruff check <上述生产与测试文件>`，结果 `All checks passed!`；跟踪文件的 `git diff --check` 无空白错误。

JUnit：`.agentwork/p0-p1/backend-tests.xml`。

额外对开始实施前快照中的 128 个受保护文件再次计算 SHA-256，包含开发 SQLite、原有上传、前端与业务模型，结果无变化、无新增真实上传文件。证据为 `.agentwork/p0-p1/protected-before.json` 与 `protected-after.json`，均位于忽略目录。

测试在应用导入前强制切换到系统临时目录 SQLite；若引擎不匹配直接终止，旧测试中的 create_all/drop_all 只能作用于该临时引擎。没有对开发数据库执行迁移、建表或删表。

## 7. 文件清单

生产代码：

- backend/app/schemas/auth.py：限制公开注册角色。
- backend/scripts/create_admin.py：独立操作员管理员创建命令。
- backend/app/services/photo_access.py：统一归属校验。
- backend/app/services/storage.py：受限路径、rb 读取、独占保存。
- backend/app/core/config.py、backend/.env.example：图像资源上限。
- backend/app/services/image_editor.py：解码、方向/ICC、限流、像素算法、编码。
- backend/app/schemas/image_edit.py：版本化参数与请求体。
- backend/app/api/v1/image_edit.py：预览/参数预览/导出与安全响应。
- backend/app/api/v1/photos.py：旧照片链路授权与上传真实 JPEG 验证。
- backend/app/main.py：注册新增路由。

测试：

- backend/tests/conftest.py：启动前隔离、逐测试清理、开发资源保护。
- backend/tests/media_fixtures.py：共享持久化订单/用户/照片 fixture。
- backend/tests/test_isolation.py。
- backend/tests/test_registration_security.py。
- backend/tests/test_photo_access.py。
- backend/tests/test_storage_security.py。
- backend/tests/test_image_preview.py。
- backend/tests/test_image_export.py。
- backend/tests/fixtures/grace_hopper.jpg、README.md：真实摄影样本及来源。

## 8. 已知限制与下一阶段

1. 完成当前本地存储闭环，不宣称 OBS/生产 PostgreSQL 已通过验收。
2. 导出是同步 HTTP JPEG Blob，没有持久任务、进度、历史记录、失败重试或草稿持久化。
3. 预览缩小后处理，导出全图处理；缩放、JPEG 重编码、浏览器色彩管理会造成细微差异。导出结果为权威结果。
4. 只支持 RGB/灰阶 JPEG，没有 RAW、CMYK、裁剪、旋转编辑、色温、批量处理。
5. 元数据采用隐私优先剥离策略，保留为目标 sRGB ICC；不保留拍摄 EXIF。
6. 接口从客户端不能指定路径，但不替代服务器操作系统的文件权限管理。
7. 本次修复公开注册入口，没有自动删除或降级已有 admin。

前端后续建议：

- 在现有 API 请求封装中增加认证 Blob 调用，通过 URL.createObjectURL 显示并及时 revoke。
- 首次读取 <=1024 JPEG，Canvas 2D 复用同一版本数学契约，滑块本地预览；停止操作后防抖调用参数预览进行校对。
- 仅点击“导出”才请求全尺寸 export；处理 429/401/403/413/422/503。
- 用 photo_id + schema_version + 原图哈希区分编辑状态；持久草稿与乐观并发控制需下一阶段设计。
- 集成时配置 CORS 暴露所需自定义响应头，并为浏览器与后端的颜色/量化差异增加真实照片对照测试。
