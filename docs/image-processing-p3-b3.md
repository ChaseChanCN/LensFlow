# LensFlow P3-B3：服务端过滤、排序与双图灯箱

日期：2026-10-17。仓库：`C:/Users/Chase/Desktop/LensFlow`。

## 1. 结论及范围

已实现订单照片目录的SQL过滤、六种确定性排序、绑定查询条件的签名游标、URL筛选状态，以及双图灯箱的认证预览、独立/同步缩放平移、标记和编辑器往返。

最终后端全量 **338通过、1跳过**；前端全量 **296通过、48个测试文件**；TypeScript与生产构建通过；Lint退出码0，保留原有4条警告。原图、图像引擎、既有模型/迁移及设计系统的94个保护文件均保持字节不变。

| 状态 | 内容 |
| --- | --- |
| 已实现并测试 | 评分/颜色/标记AND及OR过滤、六种SQL排序、重复键分页、V1过渡/V2游标、条件隔离、URL与前进后退、筛选归属/评分排序刷新、双图交互、标记、资源取消及释放 |
| 已在真实浏览器验证 | 1000条目录遍历、筛选刷新与前进后退、评分改变归属、横竖照片比较、指针拖动/滚轮/键盘、同步中心、标记、编辑器往返、连续开关三轮的位图和URL计数 |
| 已实现但未独立验证 | 真实移动设备触摸布局、Safari无ImageBitmap回退、PostgreSQL在线执行、5000张独立大图和长期堆/GPU内存；不以组件测试替代这些环境 |
| 本阶段未实现 | 任意用户自定义多列排序、RAW、EXIF编辑、相似度/人脸、批量像素处理、发布或交付修改 |
| 环境阻塞 | 自动审批拒绝删除本轮隔离临时目录，报告仅为“blocked by policy”；服务端口和测试标签已关闭，目录保留，详见清理章节 |

没有新增模型、索引、迁移或依赖。没有升级真实开发/生产数据库，没有开始P3-C。新能力依赖此前P2-B/P3-B2表结构；当前开发库仍停留于`5e0b2fd720d3`，不能把隔离环境通过视为开发库已部署。

## 2. 审计及复用

- 沿用Photo→Order对象级授权、摄影师私有PhotoAssetAnnotation和CAS写入协议。
- 沿用P3-B1的认证目录入口、页面50/最大100、原图缩略图身份、独立Blob资源池、TanStack Query和Virtual。
- 沿用`usePhotoResource` / `decodePhoto`的认证JPEG读取、EXIF规范化预览、AbortController、晚到结果隔离、ImageBitmap关闭及fallback URL回收。
- 灯箱复用P3-B2控件和写入协调器。Pick不创建客户选片；Reject不删除；不改变AnalysisResult、PhotoEditDraft、RetouchVersion或Delivery。
- 原工作区有大量既有未提交变更；未进行Git清理、重置或覆盖。文件清单仅描述本轮增量。

开始时基线：后端321通过/1跳过，前端279通过。现有Alembic head为`c4e6a8b0d212`；本轮没有改变它。

## 3. 过滤API合同

继续使用：

```http
GET /api/v1/orders/{order_id}/photos/catalog
Authorization: Bearer <access_token>
```

| 参数 | 取值及语义 |
| --- | --- |
| rating | 精确0–5星 |
| rating_min | 最低0–5星；0规范化为无最低限制 |
| colors | 逗号分隔none/red/yellow/green/blue/purple，组内OR；none表示NULL/无标记 |
| pick | 逗号分隔unmarked/pick/reject，组内OR |
| sort | id_asc（默认）、id_desc、created_asc、created_desc、rating_asc、rating_desc |
| limit / cursor | 原约定：默认50，1–100；不透明签名游标，最大512字符 |

独立类别之间为AND。rating和rating_min同时出现一律422，即使二者在数学上兼容，也不静默忽略其中之一。

类别值去除外围空白、去重并按字符串排序，作为规范身份；CSV长度和元素数量有限制。未知选项、未知query key、重复query key、非法排序、空CSV、非法范围均拒绝。

例子均由SQL处理整个已授权订单，不是在已加载页上过滤：

```text
?rating_min=4&pick=pick
?rating=5&colors=red,green
?rating=0&pick=unmarked
?colors=none&pick=reject
```

缺少Annotation时使用rating0/color none/pick unmarked，无任何默认行回填。摄影师只能查询自己订单/自己的标记；客户使用私有标记过滤或按评分排序返回403。客户未筛选目录及ID/创建时间排序保持可用，annotation仍为null。管理员不绕过归属权限。

响应形状继续是`{items,next_cursor,has_more}`及P3-B2 PhotoAsset白名单。Cache-Control继续private/no-store，不暴露storage_key。

## 4. 排序、游标及一致性

### 排序键

主键为Photo.id、Photo.created_at或`COALESCE(annotation.rating,0)`；非唯一主键用**同方向Photo.id**打破平局。例如：

```sql
ORDER BY COALESCE(annotation.rating,0) DESC, photos.id DESC
```

下一页使用元组的等价布尔条件：

```text
升序：key > last_key OR (key = last_key AND id > last_id)
降序：key < last_key OR (key = last_key AND id < last_id)
```

始终限制order_id和第一页取得的Photo.id上界，查询limit+1判断has_more。没有Python全量加载后切片，没有隐式NULL排序差异。

### SQLite时间精度

SQLite CURRENT_TIMESTAMP常保存到秒，ORM DateTime保存六位小数。直接把后页绑定为六位小数会使同一秒的字符串比较不等，破坏平局处理。

SQLite排序表达式将秒和小数秒形式规范为`YYYY-MM-DD HH:MM:SS.ffffff`，绑定值也按同样形式比较，保留现有六位微秒；PostgreSQL使用原生DateTime。混合两种SQLite时间存储形式的升/降序边界测试通过。

### 游标版本

V2签名payload包含：

```text
[2, order_id, user_id, normalized_filter_identity, last_primary_value, last_id, ceiling_id]
```

继续用现有secret和`photo-catalog:`用途前缀HMAC-SHA256。请求的规范过滤/排序必须匹配；跨订单、跨用户、篡改、未知版本或类型不合法拒绝422。客户端只传递游标，不解释其内容。

兼容政策：V1旧游标仅在**无过滤且id_asc**时接受；继续翻页返回V2。V1配新过滤/排序明确422；没有用旧结构静默解释新排序。

### 动态数据政策

这是固定ID上界的动态keyset，不是事务快照。更高新ID不进入当前序列；删除项跳过。当前界面写入评分/颜色/标记后，相关过滤/评分排序序列重置到第一页，交由服务器重建成员和顺序。

其他会话在翻页途中修改排序/过滤值，仍可能移动项目，出现跨页重访或漏访。固定数据测试保证完整、不重复；**不承诺并发编辑下的冻结快照**。用户应刷新得到新的完整序列。

## 5. 查询计划及索引判断

Annotation只在单个SQL LEFT JOIN中按当前用户关联；不逐张查询注解或订单。第一页含认证/授权最多4次SQL；后续无需再次计算MAX上界。测试对1007条重复评分/时间数据覆盖全部六种排序。

实际1000条隔离数据库EXPLAIN，完整结果见`api-verification.json`：

```text
SEARCH photos USING INDEX ix_photos_order_id (order_id=? AND rowid<?)
SEARCH photo_asset_annotations USING INDEX sqlite_autoindex_photo_asset_annotations_1
  (photo_id=? AND user_id=?) LEFT-JOIN
```

ID排序不需要临时排序；创建时间和评分排序出现`USE TEMP B-TREE FOR ORDER BY`。当前连接/默认值表达式下，简单新增rating索引或重复order_id索引不能覆盖这些排序，本轮没有无依据地加索引。

独立HTTP核对：每种排序以73条分页遍历1000条，各14个请求，全部唯一且与只读SQL参考顺序逐项相同。本机合计墙钟约108–135ms/完整序列，包含HTTP开销，不是单次SQL时延或生产SLA。PostgreSQL语句编译通过，未进行在线性能验证。

## 6. URL、目录状态与标记同步

- URL参数与后端一致；重新加载恢复条件；Back/Forward恢复历史。非法URL显示错误和显式清除入口。
- Query key保留`photo-catalog,userId,orderId`前缀，非默认条件追加规范signature。默认旧调用保持兼容。
- 切换过滤/排序取消旧序列请求，重挂当前目录视图，清空页面级选择并重置滚动；若历史条件已有缓存，重新建立第一页，避免沿用旧游标链。
- ThumbnailPool放在查询条件之外，身份仍为photoId/size；换过滤不会把查询字符串变成图片缓存身份。
- 元数据写入局部更新该订单的所有目录变体和单张元数据缓存。涉及过滤或rating排序的序列在写入结束后reset；ID/创建时间排序不因评分强制重排。
- 选择仍是稳定ID集合；消失的项目移除，不用DOM位置保存选择。查看器中照片不再属于当前列表时显示不可用并允许关闭。
- 没有正确序列缓存时不恢复旧深滚动位置，避免重置后从旧偏移又触发大量分页。

图库→编辑器保持`from=library`，用独立`library`字段携带规范筛选字符串。图库→灯箱用a/b和library；灯箱→编辑器再携带compare。返回地址始终由固定订单路径构造，不接受任意重定向URL。

例：

```text
/orders/1/library?sort=created_asc
/orders/1/light-table?a=1&b=2&library=sort%3Dcreated_asc
/orders/1/photos/2/edit?from=library&library=sort%3Dcreated_asc&compare=1%2C2
```

编辑器提供“返回灯箱”；灯箱提供“返回图库”，保留原筛选URL。编辑器像素处理、草稿和几何逻辑未改。

## 7. 灯箱交互与数学

新受保护路由：`/orders/:id/light-table`。仅摄影师，a/b必须是两个不同的有效ID；两个元数据分别通过现有认证asset接口验证照片和订单匹配。元数据被拒绝时不启动该照片预览。

桌面两列，760px以下单列回退。每侧有文件名、评分/颜色/标记、适应、放大/缩小、比例和编辑入口，中性背景不叠加装饰光晕或图像CSS滤镜。

### 缩放和平移

设图像尺寸Iw/Ih、视口Vw/Vh、相对适应缩放z：

```text
s_fit = min(Vw/Iw, Vh/Ih)
W = Iw * s_fit * z
H = Ih * s_fit * z
left = Vw/2 - cx*W
top  = Vh/2 - cy*H
```

z范围1–8；100%表示适应视口。cx/cy是图像归一化中心。W≤Vw时cx固定0.5，否则限制在`[Vw/(2W),1-Vw/(2W)]`；y同理，防止拖出无效区域。

拖动从手势起始几何和总位移计算：`cx_new=cx_start-dx/W`，y同理，不把每个鼠标事件的误差累积到上一帧。方向键每次移动40px。按钮及＋/−按1.25倍变化，滚轮按指数变化并限制边界；Ctrl/Meta滚轮留给浏览器。双击切换2倍/适应，F适应。

同步时复制z和归一化中心，另一张按自身宽高比和视口分别clamp；不复制原始像素偏移，不触发相互递归回调。到各自边界时实际中心可以不同，这是避免空白边界的既定策略。关闭同步后各自保留当前状态并独立操作。

### 焦点、快捷键和持久标记

页面内处理Escape、0–5、P/X/U、F、＋/−；操作只作用于当前焦点面板。Tab沿正常可访问控件移动，视口有可见焦点。输入/select/contenteditable、冲突对话框及Ctrl/Meta/Alt组合不触发这些快捷键，没有全局document键盘监听器。

灯箱使用同一P3-B2写入协调器和数据库记录；CAS冲突、成功项保留、显式读取新版本后重试政策不变。图库的过滤/排序序列也会随这些写入重建。

## 8. 预览资源与精度边界

- 使用真实认证JPEG预览，最长边1024px；不是网格缩略图，也不是静态占位图。
- 实际联调发现同时发起两张预览时，现有单渲染槽会使第二张429。修正为A读取/解码成功或失败后再启动B，未放宽或绕过后端并发限制。
- 页面仅持有两张解码预览；比较ID变化或离开时取消旧请求，晚到结果忽略并关闭其资源。每张ImageBitmap由原hook负责关闭，Canvas清理时宽高归零释放像素缓冲。
- 支持ImageBitmap的浏览器不为灯箱创建Object URL；fallback沿用decodePhoto的URL finally回收。没有无限量全尺寸位图缓存。
- 按两张1024² RGBA位图加两份同尺寸Canvas估算像素面约16MiB；不含JPEG Blob、JS、浏览器/GPU额外副本，这不是整体进程内存硬上限。
- 放大只是放大这份预览，不能宣称原图100%锐度/噪点检查。没有全分辨率瓦片、RAW或照片配准。
- 其他工作台占用服务器槽时仍可能429，页面显示真实错误并提供重试。

## 9. 新增与修改文件

路径相对于仓库根目录：

| 文件 | 本轮职责 |
| --- | --- |
| `backend/app/schemas/catalog_filters.py`（新增） | 有界枚举、CSV及规范身份 |
| `backend/app/services/photo_catalog.py` | SQL过滤、排序、时间规范化、V2游标及V1过渡 |
| `backend/app/api/v1/photo_catalog.py` | 参数边界、重复/未知参数拒绝和客户隐私 |
| `backend/tests/test_catalog_filters.py`（新增） | 过滤、六种keyset、隐私、版本、插入删除、查询计划及混合时间精度 |
| `frontend/src/utils/catalogFilters.ts`及`.test.ts`（新增） | URL合同、返回路径、比较ID、数学单测 |
| `frontend/src/components/photo-library/FilterBar.tsx`（新增） | 局部筛选排序控件 |
| 同目录`usePhotoCatalog.ts` | 查询身份和signal隔离 |
| `frontend/src/api/photoCatalog.ts` | 请求参数及不同排序的响应适配 |
| 同目录`useAnnotations.ts` | 更新所有目录变体，重启敏感查询序列 |
| 同目录`lightTableMath.ts`（新增） | fit、归一化中心、clamp和pan计算 |
| 同目录`LightTablePanel.tsx`（新增） | Canvas、缩放平移、资源和交互 |
| 同目录`photo-library.css` | 过滤条、两列/单列灯箱局部样式 |
| `frontend/src/pages/photographer/PhotoLibraryPage.tsx` | URL视图、查询重置、双选入口、返回上下文 |
| `frontend/src/pages/photographer/LightTablePage.tsx`及`.test.tsx`（新增） | 双图布局、元数据、同步、键盘和生命周期 |
| `frontend/src/pages/photographer/CatalogNavigation.test.tsx`（新增） | Back/Forward、竞态、成员变化、重排及两张入口 |
| `frontend/src/pages/photographer/PhotoEditorPage.tsx` | 仅扩展返回上下文与无效参数提示 |
| `frontend/src/App.tsx` | 懒加载灯箱路由 |
| `docs/image-processing-p3-b3.md`及同名目录 | 报告、截图、JUnit、API/资源/大目录证据 |

`.agentwork/p3-b3/`包含隔离启动器、代理和测试专用资源探针；探针不进入产品源码或生产构建，记录计数，不记录token或图片内容。

## 10. 自动化测试结果

```powershell
# backend工作目录
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_catalog_filters.py tests/test_photo_catalog.py -q --junitxml=../.agentwork/p3-b3/targeted-backend.xml
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest -q --junitxml=../.agentwork/p3-b3/backend-tests.xml

# frontend工作目录
npx --no-install tsc -b
npm run build
npx --no-install vitest run --reporter=default --reporter=junit --outputFile=../.agentwork/p3-b3/frontend-tests.xml
npm run lint
```

| 检查 | 最终结果 |
| --- | --- |
| 后端目标组合 | 25 passed，20.18s |
| 后端全量 | 338 passed、1 skipped、9 warnings，253.04s |
| 前端全量 | 296 passed、48 files，23.44s |
| TypeScript/生产构建 | 退出码0 |
| Lint | 退出码0，4条既有警告 |
| 新灯箱lazy chunk | JS11.10kB/gzip5.08kB；另有共享依赖成本，不以单chunk代表页面总成本 |

跳过为既有Windows symlink权限测试。后端警告为Starlette/httpx和Alembic路径分隔弃用；前端保留DarkroomVideoBackground两条、ParticlePortrait一条、TanStack Virtual/React Compiler一条。Vitest既有Toast act和jsdom Canvas提示不等于真实浏览器失败，也不视为真实绘制测试。

新增资源测试明确覆盖：A未完成时不启动B、关闭时取消、切换比较目标后拒绝旧响应、位图关闭和Canvas清零。新增目录测试覆盖URL历史、旧条件响应隔离、评分改变成员和排序后重新请求第一页。开发中新增测试曾误以为LoadingState的label是可见文字，已改为验证实际无障碍status名称后重跑。

## 11. 真实浏览器及独立HTTP证据

专用FastAPI：127.0.0.1:8050；专用Vite：127.0.0.1:4250。独立临时SQLite、上传目录和缓存，1000条授权订单元数据，受控复用8个真实JPEG文件。横图样本由真实grace_hopper.jpg离线裁切生成，仅用于测试不同宽高比；不是1000张独立照片或产品内静态演示。

实际完成：

1. 最低四星AND Pick；精确五星AND红/绿OR；评分降序；刷新及Back/Forward恢复URL。
2. 精确五星结果跨页浏览后将照片570设为0，其退出该过滤结果，序列重新从50条首批建立。
3. 独立HTTP对全部六种排序遍历1000条，与只读数据库参考顺序逐项核对，无重复/遗漏；四个示例组合也逐项核对。
4. 浏览器遍历rating_desc到1000条，采样挂载30–35张，最后一屏20张且真实JPEG已显示；19步约5901ms，包含自动化与网络等待，不是FPS。
5. 两张选择入口打开517×606竖图和517×320横图，保持各自比例，桌面两列实际显示。
6. A独立缩放至2.44140625，B仍1；真实指针拖动A改变其归一化中心而B不变；同步后两侧z/cx/cy一致，再按各自边界处理。滚轮、方向键、F均实际执行。
7. 焦点面板P/X持久化，图库返回显示A Pick、B Reject。
8. 灯箱→既有编辑器→返回灯箱→图库保留`sort=created_asc`上下文。
9. 资源探针三轮连续打开均liveBitmaps2，关闭后0，created/closed相等；进入编辑器也释放原灯箱资源。最终离开全部照片页面时created13/closed13、live0、Object URLs0。
10. 客户私有过滤403、客户未筛选200且annotation null；跨条件/跨订单游标422；另一摄影师preview/thumbnail403。
11. 8个JPEG哈希前后一致；AnalysisResult、SelectionSet/Item、PhotoEditDraft、RetouchVersion、Delivery均无新增。

计数探针验证这几轮资源所有权，不代表长期堆内存、GPU内存或稳定帧率测量。浏览器为桌面环境；窄屏CSS回退和触摸按钮已实现，未宣称完成真实移动设备验收。

证据：`api-verification.json`、`browser-observations.json`、`large-catalog-browser.json`、`http-events.json`及JUnit。

### 实际截图

组合过滤：

![最低四星且Pick](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b3/filter-min4-pick.png)

深色双图灯箱：

![深色灯箱](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b3/light-table-final-dark.png)

浅色双图灯箱：

![浅色灯箱](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b3/light-table-final-light.png)

1000条评分降序目录：

![评分降序目录](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b3/catalog-1000-rating-desc-light.png)

## 12. 数据保护、环境及部署

`protected-resources.json`：94个既有模型/迁移、开发DB、图像引擎、草稿、编辑器组件、首页及视觉系统文件全部字节不变。pytest继续使用fail-closed临时DB、后台Session和上传/通知隔离。没有在开发库create_all/drop_all或执行迁移。

本阶段不增加迁移；部署仍需正确应用先前P2-B/P3-B2迁移。当前开发revision为`5e0b2fd720d3`，未升级。PostgreSQL只有语句编译验证，没有在线验证或性能承诺。

清理状态：测试标签19已关闭，8050/4250端口确认不再监听。自动审批两次拒绝删除已核对的临时根目录，只提供“blocked by policy”。未执行删除，也未改用其他机制绕过拒绝。保留目录为：

`C:/Users/Chase/AppData/Local/Temp/lensflow-p3b3-browser-gh96c371`

其中仅包含本轮测试SQLite、受控JPEG和派生缓存；它们没有混入开发上传目录。`cleanup.json`明确记录removed=false，不将保留目录描述为已清理。

## 13. 已知限制与P3-C建议

- 当前提供六种固定主排序+ID平局规则，不支持任意多列拼接。
- 动态标记排序不提供事务级冻结快照；其他会话更改可能影响后续页，刷新重建。
- 时间/评分排序在本地计划中使用临时B-tree，1000条验证不代表超大生产库；未来需按真实分布和数据库测量再决定表达式/组合索引。
- 灯箱是1024px预览比较，非原图像素级检查；无RAW/瓦片/图像配准。
- 旧草稿、客户选择、分析、发布与交付保持独立；后续元数据系统应明确人工/自动来源和权限，不能覆盖摄影师决策。
- P3-C可扩展独立只读EXIF提取/元数据查询，再评估搜索字段和索引；不把GPS等私有信息自动暴露给客户。EXIF编辑、AI相似度和批量导出本阶段均未开始。

P3-B3到此结束。
