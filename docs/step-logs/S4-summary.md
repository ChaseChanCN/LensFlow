# S4 阶段：图片上传与 AI 初筛

## 概述

S4 阶段实现了摄影师上传照片、OpenCV 自动分析图片质量、AI 给出建议（不删原片）、摄影师复核的完整流程。

## 任务清单

| 任务 | 描述 | 状态 |
|------|------|------|
| S4-T01 | 图片上传接口（JPEG校验+存储+写Photo） | 完成 |
| S4-T02 | 图片列表与删除 | 完成 |
| S4-T03 | OpenCV 分析核心（4项指标） | 完成 |
| S4-T04 | 异常判定规则（阈值+suggestion+risk_level） | 完成 |
| S4-T05 | 分析任务调度（BackgroundTasks+状态流转） | 完成 |
| S4-T06 | 摄影师复核接口（修改判定+不删原片） | 完成 |
| S4-T07 | 前端上传与分析结果页 | 完成 |
| S4-T08 | 分析测试集验证（5张测试图） | 完成 |

## 测试结果

- 后端：116 个测试全部通过（含 14 个分析测试 + 15 个图片 API 测试）
- 前端：20 个测试全部通过（含 8 个新增上传/分析页测试）
- TypeScript 类型检查通过
- Vite 构建通过
- Ruff lint 通过

---

## S4-T01：图片上传接口

### 实现目的

摄影师在完成拍摄后，需要将 JPEG 原片上传到系统，系统校验格式和大小后存储到本地（开发环境）或 OBS（生产环境），并写入 Photo 表记录。

### 如何实现

- 路由：`POST /api/v1/orders/{order_id}/photos`，仅摄影师可调用
- 校验：content-type 必须为 image/jpeg，文件大小不超过 20MB，非空
- 存储：调用 Storage 抽象层 save 方法，返回 storage_key
- 图片尺寸：用 OpenCV 解码获取 width/height
- 状态流转：若订单状态为 WAITING_UPLOAD，上传后自动转为 ANALYZING
- 响应：返回 PhotoUploadResponse（photo 信息 + analysis_triggered 标志）

### 改进之处

- 使用 Storage 抽象层，开发用 LocalStorage，生产可无缝切换 OBS
- 上传后立即触发后台分析任务（BackgroundTasks），无需额外 API 调用
- 返回 analysis_triggered 标志，前端可据此决定是否跳转分析页

### 存在的问题

- 当前仅支持 JPEG，未来需扩展 PNG/HEIC 等格式
- 大文件上传无分片机制，20MB 限制可能不够
- 并发上传无队列控制，大量图片可能内存溢出

---

## S4-T02：图片列表与删除

### 实现目的

摄影师需要查看某订单下所有已上传照片，并在分析完成前删除误传的照片。

### 如何实现

- 列表：`GET /api/v1/orders/{order_id}/photos`，摄影师和客户均可查看
- 删除：`DELETE /api/v1/orders/{order_id}/photos/{photo_id}`，仅摄影师可调用
- 删除约束：仅当订单状态为 WAITING_UPLOAD 或 ANALYZING 时允许删除
- 删除时同步清理存储文件和分析结果

### 改进之处

- 删除操作同时清理物理文件和数据库记录，避免孤儿文件
- 状态约束防止分析完成后误删照片

### 存在的问题

- 列表接口未分页，大量照片时可能性能问题
- 未实现缩略图，前端需加载完整图片

---

## S4-T03：OpenCV 分析核心

### 实现目的

对上传的照片进行自动化质量分析，输出 4 项客观指标，为 AI 建议提供数据基础。

### 如何实现

文件：`backend/app/services/image_analyzer.py`

4 项指标：
1. **sharpness_score**（清晰度）：Laplacian 方差，值越大越清晰
2. **brightness_mean**（平均亮度）：灰度图均值
3. **highlight_ratio**（高光比例）：亮度 > 240 的像素占比
4. **shadow_ratio**（暗部比例）：亮度 < 15 的像素占比

返回 AnalysisMetrics dataclass，包含 4 项指标 + suggestion + risk_level。

### 改进之处

- 纯函数设计，无副作用，易于测试
- 使用 Laplacian 方差而非简单的边缘检测，更准确反映清晰度
- 指标计算与判定规则分离，便于独立调整阈值

### 存在的问题

- 未处理 EXIF 方向信息，旋转的照片可能分析不准
- 清晰度阈值需根据不同拍摄场景（人像 vs 风景）调整
- 未检测噪点、色彩偏移等指标

---

## S4-T04：异常判定规则

### 实现目的

基于 S4-T03 的客观指标，给出 AI 建议（suggestion）和风险等级（risk_level），辅助摄影师筛选。

### 如何实现

判定规则（按优先级）：
1. **suggest_exclude**（高风险）：清晰度 < 50 且非浅景深
2. **suggest_exclude**（高风险）：高光比例 > 30% 或暗部比例 > 40%
3. **need_review**（中风险）：清晰度 < 100 或亮度 < 30 或亮度 > 220
4. **no_issue**（低风险）：其余情况

浅景深检测：中心区域清晰度显著高于边缘时，不判定为模糊。

### 改进之处

- AI 仅给建议，不自动删除原片，保留摄影师最终决定权
- 浅景深检测避免将人像虚化误判为模糊
- 三级风险等级便于前端分类展示

### 存在的问题

- 阈值为硬编码，未来应支持配置文件或数据库配置
- 浅景深检测算法较简单，复杂场景可能误判
- 未考虑人脸检测，人像照片的清晰度判定应优先面部区域

---

## S4-T05：分析任务调度

### 实现目的

照片上传后自动触发后台分析任务，分析完成后写入 AnalysisResult 表，无需人工干预。

### 如何实现

- 使用 FastAPI BackgroundTasks 在上传响应后异步执行分析
- 分析任务函数 `_run_analysis`：打开存储文件 -> 调用 analyze_image -> 写入 AnalysisResult
- 异常处理：分析失败时写入 suggestion=need_review, risk_level=medium 的兜底记录
- 状态流转：上传时 WAITING_UPLOAD -> ANALYZING

### 改进之处

- 使用 BackgroundTasks 而非 Celery 等外部任务队列，减少基础设施依赖
- 异常兜底确保每张照片都有分析记录，前端不会查不到结果
- 分析与上传解耦，上传响应不受分析耗时影响

### 存在的问题

- BackgroundTasks 在进程重启时会丢失，生产环境应改用持久化任务队列
- 无分析进度跟踪，前端只能轮询查询结果
- 无并发控制，大量同时上传可能 CPU 爆满

---

## S4-T06：摄影师复核接口

### 实现目的

摄影师查看 AI 分析结果后，可以确认或修改最终判定（保留/剔除/待定），AI 建议仅供参考。

### 如何实现

- 查询分析结果：`GET /api/v1/photos/{photo_id}/analysis`，摄影师和客户可查
- 复核：`PATCH /api/v1/analysis/{analysis_id}/review`，仅摄影师可操作
- 复核字段：reviewed=True, reviewer_id, reviewed_at, final_decision
- final_decision 取值：exclude / keep / pending
- 不删除原片，仅标记决策

### 改进之处

- AI 建议与最终决策分离，摄影师可覆盖 AI 判定
- 记录复核人和复核时间，便于审计
- 不删除原片，保留完整证据链

### 存在的问题

- 未记录复核修改历史，无法追溯摄影师修改了哪些判定
- 缺少批量复核接口，大量照片时需逐张操作

---

## S4-T07：前端上传与分析结果页

### 实现目的

为摄影师提供照片上传界面和 AI 分析结果展示界面，支持在线复核。

### 如何实现

新增文件：
- `src/api/photos.ts`：图片 API 客户端（upload/list/delete/getAnalysis/review）
- `src/pages/photographer/UploadPage.tsx`：上传页
- `src/pages/photographer/AnalysisResultPage.tsx`：分析结果页
- 对应测试文件

UploadPage 功能：
- 文件选择器（多选 JPEG）
- 批量上传，逐个处理
- 已上传照片列表（文件名、尺寸、大小）
- 删除按钮（仅 WAITING_UPLOAD/ANALYZING 状态可删）
- 跳转分析结果页按钮

AnalysisResultPage 功能：
- 逐张展示照片分析指标（清晰度、亮度、高光/暗部比例）
- AI 建议（正常/需复核/建议剔除）+ 风险等级颜色标识
- 复核按钮（保留/剔除/待定）
- 复核状态展示

路由更新：
- `/orders/:id/upload` -> UploadPage
- `/orders/:id/analysis` -> AnalysisResultPage

OrderDetailPage 更新：
- WAITING_UPLOAD/ANALYZING/WAITING_REVIEW 状态显示"照片管理"区块
- 提供"上传照片"和"查看分析结果"入口按钮

### 改进之处

- 简约灰黑白色系，无 emoji，符合设计规范
- 使用 TanStack Query 管理数据，自动缓存和刷新
- 分析指标用网格布局展示，信息密度高且清晰
- 风险等级用颜色区分（灰/黄/红），直观

### 存在的问题

- 上传无进度条，大文件体验不佳
- 无拖拽上传支持
- 分析结果页未分页，大量照片时页面过长
- 无图片预览缩略图

---

## S4-T08：分析测试集验证

### 实现目的

使用 5 张代表性测试图片验证 AI 分析核心的准确性和误判率。

### 如何实现

文件：`backend/tests/test_analyzer.py` 中的 TestTestSetValidation

5 张测试图片（用 OpenCV 程序生成）：
1. **正常图片**：随机噪声 80-180 亮度，应判定 no_issue / low risk
2. **模糊图片**：高斯模糊 51x51 核，清晰度应 < 100
3. **过曝图片**：全白 250 亮度，亮度均值应 > 220
4. **欠曝图片**：全黑 5 亮度，亮度均值应 < 30
5. **浅景深图片**：中心清晰边缘模糊，不应误判为高风险

### 改进之处

- 测试图片程序生成，无需维护物理测试文件
- 覆盖正常和 4 种异常场景，验证判定准确性
- 浅景深测试确保不误判虚化人像

### 存在的问题

- 测试图片为合成图，与真实照片可能有差异
- 未测试混合异常（如模糊+过曝）
- 未测试不同分辨率和宽高比的图片
