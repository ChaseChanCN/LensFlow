# LensFlow P3-C4：非破坏性描述元数据、关键词和 XMP

日期：2026-10-18。分支：`design-system`。本阶段到 C4 为止，不进入下一阶段。

## 1. 结论与交付边界

已在现有 FastAPI / SQLAlchemy / React / TanStack Query 架构内实现摄影师描述元数据工作流。没有引入依赖、替换框架、写回原图，或把描述元数据混入像素编辑草稿。

四层职责如下：

| 层 | 权威与用途 |
|---|---|
| 原始元数据 | 上传 JPEG 中的 EXIF/IPTC/XMP，由 C1 只读解析 |
| Overlay | 摄影师拥有的持久编辑意图，逐字段三态，CAS 修订号 |
| Effective | 纯函数将当次读取的原始描述与 Overlay 合成 |
| XMP | 请求时从 Effective 五项白名单派生的下载内容，不落入原图存储 |

真实开发 SQLite 未迁移。新增表只能在部署前审核、备份并手动迁移；测试只在临时 SQLite 与随机新建 PostgreSQL 数据库中执行。

## 2. 审计依据与改动文件

复用了 `services/photo_metadata.py` 的 C1 优先级（XMP → IPTC → EXIF；关键词优先 XMP 再 IPTC）、实际 SHA-256、解析告警；复用了 `photo_access.py` 的 Photo → Order 鉴权、`photo_annotation.py` 的批量授权模式、C3 数据库错误脱敏与 D1 隔离数据库能力。

新增后端：

- `backend/app/models/photo_metadata_overlay.py`：Overlay、关键词状态、关键词关联。
- `backend/app/schemas/metadata_overlay.py`：完整快照、三态、关键词规则、批量与重建契约。
- `backend/app/services/metadata_overlay.py`：纯 resolver、受限读取、CAS、事务和投影发布。
- `backend/app/services/keyword_search.py`：SQL membership、覆盖率和检索参数规范化。
- `backend/app/services/metadata_sidecar.py`：描述白名单 XMP 序列化。
- `backend/app/api/v1/metadata_overlay.py`：认证 API、128 KiB 请求体上限、私有响应。
- `backend/alembic/versions/e6a8c0d2f434_descriptive_overlay.py`：新迁移。
- `backend/tests/test_metadata_overlay.py`、`backend/tests/postgres/test_metadata_overlay.py`、`backend/tests/postgres/c4_workers.py`。
- `backend/scripts/verify_metadata_overlay.py`：仅新建受控 PostgreSQL 沙箱的真实 HTTP、浏览器夹具及性能测量。

兼容扩展：`models/__init__.py`、`main.py`、`schemas/catalog_filters.py`、`services/photo_catalog.py`、`api/v1/photo_catalog.py`、`api/v1/metadata_index.py`（时间线增加关键词条件）、`services/schema_readiness.py`、PG readiness 测试的当前 head 预期。

新增前端：

- `frontend/src/api/metadataOverlay.ts` 及测试：身份与模式校验、认证 API、取消信号、下载。
- `components/photo-library/DescriptiveMetadata.tsx` 及测试：详情表单、原始值、来源、冲突解决。
- `MetadataBatch.tsx` 及测试：稳定 ID 批量操作、进度、失败项显式重试。
- `KeywordTools.tsx` 及测试：关键词筛选、索引覆盖率、分批重建/暂停。
- `descriptive-metadata.css`：局部样式，继承当前主题和字体。

修改 `PhotoViewer.tsx`、`PhotoLibraryPage.tsx`、`utils/catalogFilters.ts`，并扩展查看器和目录导航的既有测试夹具。未修改首页粒子、全局设计系统、缩略图身份、像素处理算法、Photo/Order/User/RetouchVersion/Delivery 模型或历史迁移。

## 3. 持久化与迁移

新 head `e6a8c0d2f434`，down_revision 为实际原 head `d5f7a9c1e323`。

| 表 | 关键约束 |
|---|---|
| `photo_metadata_overlays` | `(photo_id,user_id)` 唯一；Photo/User CASCADE；revision ≥ 1；来源 SHA 长度64；每字段 mode/value 一致性与长度 CHECK |
| `photo_keyword_states` | 同一归属唯一；原始 SHA、描述 parser 版本、overlay_revision、UTC 时间；可删除重建 |
| `photo_effective_keywords` | FK state CASCADE；每状态 key 与位置唯一；位置0–63；显示值1–128，检索 key1–256字符；state/key 索引 |

关键词快照采用 JSON 数组；`json_array_length` 限64，并以每位置 CHECK 限制非空值及长度。查询权威是独立关系表，不是逗号字符串或 JSON 全表扫描。SQLite 和 PostgreSQL 使用 SQLAlchemy JSON 表达式分别编译位置检查。

时间遵循现有模型的无时区数据库列与应用 UTC 约定；保留 D1 PostgreSQL 连接 `SET TIME ZONE UTC` 修正。此次没有编辑已发布迁移或对开发库执行 `create_all/drop_all/upgrade`。

## 4. 三态、版本与来源

| 模式 | 文本有效值 | 关键词有效值 |
|---|---|---|
| inherit | 当次原图描述值，缺失为 null | 当次原图关键词，缺失为 [] |
| override | 非空显式文本 | 显式列表，可为 [] |
| clear | null | [] |

无 Overlay 时逻辑 revision=0、五项 inherit；GET 不创建默认 Overlay 或索引记录。任何接受的完整保存，包括无变化保存和重置，都递增 revision。DELETE 实际写入一个 revision 化的全 inherit 快照，不物理删除历史版本保护。

Resolver 返回 `fields / original / effective / provenance / revision / source_sha256 / warnings`。新端点不返回 GPS、序列号、MakerNote 或原始 packet。原字段来源按 C1 provenance 展示，编辑来源为 `lensflow:override/clear`。

读取、保存、批量 add/remove、XMP 都读取实际源文件；不接受浏览器提供的路径、storage_key 或来源 hash。源不可用时详情/保存/导出失败，不把 Overlay 冒充完整原始元数据。原始异常关键词会产生告警并从有效规范化列表中跳过；描述文本按契约限长，截断有明确 warning，C1 原始 API 本身未修改。

若原始 SHA 与上次接受编辑时的 SHA 不同，返回 `source_changed=true` 与警告，保留所有覆盖和清空意图；继承值取新原图。用户在核对后保存表示接受此次读到的新来源基线。未确认保存前，警告持续存在。

`verified_at_read` 是读取瞬间的指纹，不是文件系统不可变锁：外部进程仍可能在读取后替换文件。存储引用在获取有序行锁后再次核对。源替换应通过维护流程随后刷新 C2/C4 索引；此阶段未引入文件监听。

## 5. 单张 API

所有新增接口仅允许订单所属摄影师，使用现有 Bearer 认证。客户、其他摄影师、管理员角色不借助客户端 order_id 获得权限。

| HTTP | 路径 | 输入 / 输出 |
|---|---|---|
| GET | `/api/v1/photos/{id}/metadata-effective` | 返回有效描述、原始描述、模式/来源、修订号、服务端源 SHA、告警 |
| PUT | `/api/v1/photos/{id}/metadata-overlay` | 完整五字段快照 + expected_revision；返回实际保存值 |
| DELETE | 同上 | JSON `{expected_revision}`；CAS 全继承重置 |
| GET | `/api/v1/photos/{id}/metadata-sidecar.xmp` | UTF-8 `application/rdf+xml` 下载，安全文件名 `photo-{id}.xmp` |
| POST | `/api/v1/photos/metadata-overlays/revisions` | `{photo_ids:[...]}`，上限100；一次授权、一次查询版本，无源文件读取 |

PUT 示例：

```json
{
  "expected_revision": 0,
  "fields": {
    "title": {"mode":"override","value":"北京 <纪实> & 作品"},
    "caption": {"mode":"clear"},
    "creator": {"mode":"inherit"},
    "copyright": {"mode":"inherit"},
    "keywords": {"mode":"override","value":["人像","Portfolio"]}
  }
}
```

409 返回 `{code:"METADATA_CONFLICT",message,current:<当前有效元数据>}`。客户端保留本地草稿，展示 current；载入服务器值与基于 current.revision 重提完整草稿均须显式选择。重提仍可能再次409，不会自动合并。

错误包括401/403/404/413/415/422/429/503；数据库缺表返回脱敏 `SCHEMA_NOT_READY`，不暴露SQL、路径或凭据。成功和失败均附 private/no-store、Vary:Authorization、nosniff；请求体超过128KiB在解析前拒绝。

## 6. 批量操作与资源策略

`POST /api/v1/photos/metadata-overlays/batch`：

```json
{
  "items":[{"photo_id":1,"expected_revision":2},{"photo_id":2,"expected_revision":0}],
  "operation":{"type":"keywords_add","keywords":["精选","人像"]}
}
```

支持 `keywords_add/remove/replace/clear/inherit` 与 `fields`（title/caption/creator/copyright 的部分三态修改）。UI 初版提供全部关键词操作，以及共享作者/版权。

最多100个唯一ID；批量授权是一条 Photo→Order JOIN，任何不存在或越权ID让整批在写入、源读取前失败。源读取在写事务前完成。随后重新授权，按 photo_id 获取 Photo 行锁，批量读取 Overlay/State，逐项 CAS，批量读取实际存储结果并发布关键词。所有写在一个事务中，意外错误全体回滚；授权通过后的正常版本冲突可与成功项同时返回，响应顺序仍为调用方顺序。

add/remove 基于当前 effective 关键词，不丢失继承值。add 先按 identity 合并再检查最终64上限；remove 对大小写等价 key 处理。所有未触及描述字段保持原值。初次创建有唯一键兜底，不靠进程内锁保证并发。

服务端每请求源字节累计≤64MiB，每文件≤现有 image_max_bytes；文件之间检查10秒预算；复用每进程2个 metadata 读取槽。不启动后台任务。超预算整批不提交，调用方应缩小批次。前端每次10张批量写，显示进度；网络失败/冲突不自动重放，只重读失败ID的新版本后显式重试。多次10张请求之间不提供全操作原子性，已成功批次会保留。

## 7. 关键词规范与 SQL 查询

- NFC；去除首尾空白；拒绝空关键词、Cc/Cs 控制字符、换行/制表符及不安全 XML 字符。
- 单项1–128 Unicode字符，最多64个；服务器以 Unicode casefold 为相等规则，保留第一次出现的展示大小写，不翻译中文、不做NFKC语义折叠。
- 前端做输入反馈与NFC；服务器校验及 casefold 是权威。浏览器 maxlength 基于UTF-16，极端非BMP字符串输入上限可能更严格。
- catalog 参数 `keywords` 是 JSON 字符串数组，最多10项，**多关键词 AND 精确匹配**，不做分词或模糊匹配。
- 关键词与评分、颜色、Pick、相机、镜头、日期条件之间 SQL AND；通过有索引的 EXISTS 子查询避免JOIN重复行。时间线复用同一条件。
- 查询不读取任何原始 JPEG，不做 Python 全目录过滤。

示例：`GET /api/v1/orders/1/photos/catalog?keywords=["人像","精选"]&rating_min=3&camera_model=canon...`，实际请求须 URL 编码。

### 游标

没有关键词的 V1/V2/V3 分支与 identity 保持原样；有关键词使用 V4，将规范化关键词与其他元数据条件一起哈希绑定签名。变更关键词、订单、用户或过滤条件后不能重用旧游标。沿用 ID ceiling 与实时 membership；分页过程中编辑可能改变成员，不声称冻结快照。

### 可重建投影与不完整状态

`GET /orders/{id}/metadata-keywords/status` 返回 total/indexed/unknown/complete、parser_version、`source_freshness=verified_at_index_only`。

`POST /orders/{id}/metadata-keywords/rebuild` 输入 `{after_id:0,limit:10}`；一次最多10张，返回 processed/errors、has_more、next_after_id、coverage。缺失/损坏源逐项跳过、清除旧投影并报告；下一批仍可继续。预算或基础设施错误不会伪报整批成功。前端支持暂停与当前组件内续传，一轮最多100批，超过后可再点击继续。

| 情况 | 行为 |
|---|---|
| 尚无 C2 原始索引 | C4 直接有界只读解析，写入/显式重建后可准确检索 |
| Overlay 保存 | 在同一事务同步当前 SHA/parser/revision 的有效关键词 |
| C4 parser 旧或 overlay_revision 不匹配 | SQL 排除，coverage 记 unknown |
| C2 已观察到不同 SHA、旧 parser、pending/failed/unsupported | 排除可能过时的 C4 投影，需刷新 C2 后重建 C4 |
| 源外部改变但未刷新 | 不假装实时验证；状态明确“仅建立索引时核实” |
| 重建与编辑并发 | 同序 Photo 行锁，锁内读当前 Overlay；不把旧修订投影覆盖到新版本 |
| 源不可读 | 单张操作失败；显式重建将旧 projection 去除并报告 unknown |

每次源或解析器维护后，先刷新已有 C2 索引，再重建 C4。二者独立、不自动全目录读取、不复制 GPS/序列号到描述索引。

## 8. XMP 序列化与独立验证

使用 ElementTree 构造命名空间节点与文本，固定顺序、UTF-8 XML declaration，无动态拼接 XML、无 DOCTYPE、无外部实体、无源 packet 拷贝，输出≤128KiB。

| 字段 | RDF 形状 |
|---|---|
| title / caption / copyright | dc:title / dc:description / dc:rights → rdf:Alt → xml:lang="x-default" |
| creator | dc:creator → rdf:Seq 单个创建者字符串 |
| keywords | dc:subject → rdf:Bag |

空值导出空容器；不生成技术EXIF、GPS、序列号、MakerNote、存储key。只导出当前有效主描述值；C1其他语言的 localized alternatives 不自动混入已覆盖主值。

映射依据 Adobe 的 [Dublin Core 定义](https://developer.adobe.com/xmp/docs/xmp-namespaces/dc/) 和 [Language Alternative 数据类型](https://developer.adobe.com/xmp/docs/xmp-namespaces/xmp-data-types/)。title/description/rights 使用语言替代数组，creator 有序、subject 无序；x-default 为唯一默认项。

测试用不同实现 `xml.dom.minidom` 做聚焦验证：根/命名空间、五字段白名单、Alt/Seq/Bag、xml:lang、中文/emoji、`& < > "` 转义、值往返、确定性与私有数据排除。真实 TCP 导出的 `http/verified-photo-1.xmp` 也通过同一独立 validator。

本机未发现 ExifTool，未实测 digiKam/Adobe 导入。不同消费者合并空容器、嵌入描述和 Sidecar 的策略尚未验证，不能宣称所有软件中的“清空”都能覆盖嵌入原始值。

## 9. 前端数据流与交互保护

查看器原始预览资源管理不变；只有摄影师显式展开“描述元数据与 XMP”才发单张请求。表单保存独立于 PhotoEditDraft，显示五字段原始只读值、编辑模式、已保存有效值和来源。

组件以照片ID重置、所有请求带AbortSignal，取消或过期响应不写新照片状态；卸载取消未完成请求。网络失败保留文本。收起详情、关闭查看器、上一/下一张及进入修图前有脏草稿确认，刷新/关闭页面有 beforeunload 提示。

XMP 只下载已保存值；脏草稿时按钮禁用。描述草稿未保存时暂禁评分控件，防止筛选变化移除照片而丢失文本。沿用 saveBlob，及时释放下载 URL。没有新增 Canvas/Bitmap，缩略图池、缓存 key 和照片外观均不变。查看器预览与描述面板使用不同的 React key 命名空间；浏览器日志发现的重复 key 警告已修正并增加回归断言。

元数据保存只更新关键词状态查询，并重启含关键词的目录序列；不整体失效 JPEG 缩略图资源。URL keywords 进入目录 query key 与灯箱/修图的返回上下文。稳定ID选择沿用原实现，批量操作不依赖虚拟卡片挂载。

限制：beforeunload 无法保证浏览器强退恢复；尚无描述表单的本地离线草稿。SPA 全局导航的所有可能入口没有新增统一路由 blocker，查看器自身的常用离开动作已保护。

## 10. 验证、性能与证据

最终执行结果与数据保护清单见本节末的完成记录及同目录 JSON/XML/log 证据。测试不把 jsdom 当浏览器，也不把普通 SQLite 中跳过的 PG 项计为通过。

真实HTTP环境：随机新建 PostgreSQL 14.24、localhost:5433、UTF8、English_United States.936；数据库权限与 nonce/OID/owner 由现有 sandbox 验证。密码通过本机遮罩输入，仅进程内存传递，不在参数/文件/报告中保存。

浏览器验收使用 4255→8055 的独立代理与一次性账号，验证真实 JPEG、持久化、双会话409及草稿保留/显式重提、批量关键词、关键词+评分+相机筛选、XMP下载、浅/深色、灯箱、现有v2像素草稿和几何控件。只关闭本次创建的标签页，恢复原深色主题。

性能夹具是1007条目录记录引用同一张真实 JPEG，再增加一次真实 HTTP 上传。EXIF/XMP 是明确构造的测试标签，不当作真实相机来源。不能将结果推广为1008张不同大图解码性能。

| 测量 | 本机结果 | 口径 |
|---|---:|---|
| 单张 Overlay HTTP 保存 | 139.94 ms | TCP、认证、源读取、数据库和JSON响应 |
| 两张关键词 batch HTTP | 123.889 ms | 同上，不与单张结果当作严格基准对比 |
| 100张 batch | 2384.17 ms | 服务函数+PostgreSQL事务+真实源读取，无HTTP |
| 1007行关键词 catalog | 中位11.20 ms、最大29.16 ms | 5次数据库服务查询，非浏览器耗时 |
| 纯 resolver | 中位0.050 ms | 100次，不含源读取/SQL |
| 纯 XMP 生成 | 中位0.152 ms，695B | 100次；另一份已编辑HTTP XMP为709B |
| 浏览器1008条目录 | 标准密度28–35张挂载 | 实际逐页加载，非静态假数据 |
| 1008稳定全选后切紧凑 | 40张挂载 | 选择保留；测试动作未批量改1008张 |

保存了 `http/keyword-explain.json`（真实 PostgreSQL EXPLAIN ANALYZE BUFFERS）、HTTP JSON、XMP、`browser-evidence.json`。浏览器20次分页控制操作约26.6秒，包含自动化与网络等待，不作为帧延迟或内存峰值。未测浏览器堆与后台RSS，不编造内存结论。

截图：

- [暗色真实冲突](image-processing-p3-c4/browser-conflict-dark.png)
- [浅色描述表单](image-processing-p3-c4/browser-editor-light.png)
- [关键词组合筛选](image-processing-p3-c4/browser-keyword-light.png)
- [1008条虚拟网格](image-processing-p3-c4/browser-1008-grid.png)
- [灯箱](image-processing-p3-c4/browser-light-table.png)
- [原像素编辑器](image-processing-p3-c4/browser-pixel-editor.png)

## 11. 部署前置与后续

1. 备份并确认目标数据库；审核新迁移，手工升级至 `e6a8c0d2f434`。应用启动和 `/ready` 只检查，不自动迁移。
2. 保持当前数据库 UTC 连接设置和存储权限，部署已有依赖即可，无新增包。
3. 旧目录原始关键词不自动全库解析；通过摄影师页面分批重建。若 C2 已有过期状态，先刷新 C2，再建 C4。
4. 前后端一并发布，确认五字段契约、私有响应与V4游标；不重用变更条件前的游标。
5. 回滚代码前评估保留 Overlay 的数据备份；迁移 downgrade 会删除新增编辑表，不能在真实数据上盲目执行。

下一候选 C5：ExifTool/真实 digiKam/Adobe sidecar 导入矩阵、描述草稿离线恢复、更明确的来源变更确认与索引诊断。此次未实现 RAW、AI相似、脸部标签、GPS编辑、JPEG嵌入写回、XMP ZIP或后台队列。

### 最终完成记录

| 验证 | 实际结果与证据 |
|---|---|
| 常规隔离 SQLite 全量清单 | 36文件、672个唯一节点；555通过、117跳过、0失败/错误；`sqlite-complete-result.json` |
| 实际 PostgreSQL 14.24 全量 | 131通过、0跳过/失败；其中116项真实PG，15项纯沙箱保护测试；`postgres-all-final.xml`、`postgres-all-final-result.json` |
| 前端全量 | 58文件、342通过、0失败/待定；`frontend-tests-final.json` |
| TypeScript | `npx --no-install tsc -b`，退出0；`typescript.log` |
| 生产构建 | `npm run build`，退出0；`build.log` |
| lint | `npm run lint`，退出0，仅4条既有警告；`lint.log` |
| C4新增Python源码/迁移/测试/HTTP脚本 Ruff | 退出0；`ruff.log` |
| 实际TCP与浏览器 | PostgreSQL真实HTTP与双会话/筛选/下载/灯箱/修图读取均验证；`http/http-final.json`、`browser-evidence.json` |
| 最终React key和dirty评分保护 | 另建临时SQLite真实浏览器复核：仅1个预览、原生disabled生效、保存成功、Vite日志0重复key；`browser-final-recheck.json` |

普通SQLite清单中的117跳过=116项需实际PG的测试+1项Windows符号链接；116项PG已在专用套件实跑。两个套件的15项纯保护测试有重叠，不把555+131当作互不重复的后端总数。

执行命令（从对应工作目录）：

```text
# 根目录；保留正常隔离fixtures，按全文件清单分4个独立进程
<venv-python> .agentwork/p3-c4/run_sqlite_partitioned.py
# 全量第4组受影响后完整复跑；合并其他3组与本组JUnit，并核对672个唯一节点
<venv-python> .agentwork/p3-c4/rerun_sqlite_group4.py

# backend；由交互式凭据协调器提供既有sandbox能力，命令/文件无密码
<venv-python> -m pytest -c tests/postgres/pytest.ini --confcutdir=tests/postgres tests/postgres -q -ra --junitxml=../docs/image-processing-p3-c4/postgres-all-final.xml
<venv-python> -m scripts.verify_metadata_overlay --output ../docs/image-processing-p3-c4/http --browser-stop ../.agentwork/p3-c4/browser.stop --port 8055

# frontend
npx --no-install vitest run --maxWorkers=2 --reporter=json --outputFile=../docs/image-processing-p3-c4/frontend-tests-final.json
npx --no-install tsc -b
npm run build
npm run lint
```

首轮高并发同时运行后端、PG与前端时，SQLite有两项进程检查点20秒超时；PG有一项同类超时和一项进程竞争OperationalError。保留 `postgres-all.log` 和最初分组日志，不将它们当通过。没有放宽超时或删断言：降低同时运行的负载后，第4组全量以及PG全量复跑通过。测试仍是本机可靠性证据，不代表任意过载环境下都不会出现503。

前端另一次全量曾因旧目录测试没有隔离新增keyword-status请求，导致其把索引网络错误当成分页错误；为目录/导航单测增加独立状态夹具，保留原分页断言。最终342项完整重跑通过。jsdom仍提示无原生Canvas，这是测试环境已知限制；真实JPEG/Canvas由实际浏览器与HTTP证据补充。

4条原有lint警告位于 DarkroomVideoBackground（2条）、ParticlePortrait、AssetGrid/TanStack Virtual。未改这些受保护功能来消除警告。

### 数据与环境保护结果

- C4前340个基线文件中326个字节不变，14个既有文件为预期C4兼容扩展；82个受保护文件全部不变。列表在 `protection.json`。
- 真实开发SQLite仍为 `5e0b2fd720d3`，SHA-256仍为 `5c923e9d00775cc54a40d44e00c718146bc4858767fe5474fbadff5b757d1fef`。
- 真实Grace Hopper JPEG仍为 `e1f57e98cf38076c0f9a058d74ffddf90f20453e436033784606b63c8ed2e49a`。
- HTTP验证前后，原图字节/storage_key及已有Selection/Delivery/Retouch/PhotoEditDraft快照不变，`http/http-final.json`。
- PostgreSQL每次测试/HTTP的随机新库与临时目录均确认清理；初始3个数据库的OID/owner/编码/collation清单不变，剩余新库为空，`database-protection.json`。
- 凭据协调器已停止，本轮临时HTTP/Vite进程已不在运行；只关闭了本轮创建的浏览器标签页。
- **一个收尾临时目录未能清理**：`C:\Users\Chase\AppData\Local\Temp\lensflow-c4-browser-0a1kap9b`。最终浏览器helper被会话中断后留下该目录；已只读核对里面的JPEG哈希不变。对这个精确新建目录的原生PowerShell递归清理被自动审批拒绝，理由仅为 `blocked by policy`，没有换方式重试。记录于 `sqlite-browser-cleanup.json`；不能宣称本轮全部临时文件都已删除。

### 状态分类

- **已实现并验证**：五字段三态/CAS、重置、批量操作/冲突与事务、有效关键词SQL与V4游标、显式重建/覆盖率、只读XMP、摄影师UI与多选、SQLite/PG14、实际HTTP/浏览器和保护核对。
- **已实现但未独立验证所有消费者**：XMP结构和独立DOM往返已验；未实测digiKam/Adobe等桌面软件的合并与清空策略。
- **未实现（明确不在C4范围）**：JPEG写回、RAW/GPS/人脸/AI标签、ZIP、层级标签、离线描述草稿和持久后台任务。
- **环境阻塞或限制**：当前PG18不可用，C4没有宣称PG18验收；ExifTool未安装，使用聚焦独立DOM validator；上述单个临时目录清理被自动审批拦截。
