# LensFlow P3-B2：资产评分、标记、多选与批量操作

日期：2026-10-17。工作目录：`C:/Users/Chase/Desktop/LensFlow`。

## 1. 结论与验收范围

已实现持久化评分、颜色、Pick/Reject、虚拟图库多选及批量元数据更新。复用 P3-B1 图库、缩略图资源池、认证客户端、TanStack Query、TanStack Virtual 与既有编辑器；没有新增前端依赖。

最终后端全量 **321 passed / 1 skipped**；前端全量 **279 passed / 45 files**；TypeScript、生产构建通过；Lint 退出码0，有4条延续自P3-B1的警告。测试和浏览器证据分开记录，不以 jsdom 代替真实浏览器结果。

| 状态 | 内容 |
| --- | --- |
| 已实现并验证 | SQLite 持久化、严格参数校验、权限、首次创建竞争、数据库CAS、整批权限拒绝、部分revision冲突、事务回滚、目录LEFT JOIN、选择/快捷键、局部乐观更新、显式重试、卡片/查看器同步 |
| 已在真实浏览器验证 | 五星/绿色/Pick刷新持久化、Reject不删除、跨行批量、Ctrl/Shift、查看器与编辑器往返、双页面旧版本冲突、离屏选择、1000项全选及10个批次保存 |
| 已实现但未完成独立环境验证 | PostgreSQL在线迁移/真实竞争、跨设备性能、5000张独立大图、长时间内存剖析；不能以本地SQLite结果替代 |
| 本阶段未实现 | 高级过滤/评分排序、Light Table、RAW、AI自动评分、批量像素编辑/导出、RetouchVersion发布、客户选片自动化 |
| 环境限制 | 本机未发现localhost:5432可用PostgreSQL；仅生成PostgreSQL离线DDL。Windows符号链接创建权限导致1个既有存储测试跳过 |

**真实开发数据库没有升级。** 本次迁移仅在隔离测试库和浏览器临时库执行。在开发/生产库启用新代码前，仍需通过受控部署流程审阅并应用迁移；旧库不具备新表时不能把新目录接口视为已经可用。

## 2. 审计结论及业务语义

- Photo/Order 归属沿用 `backend/app/services/photo_access.py`，不信任客户端的order_id、user_id或storage_key。
- 新标记仅属于订单摄影师。客户可以按既有权限读取照片目录，但 `annotation=null`，不能读取或修改摄影师的私有标记；管理员不绕过订单归属。
- 客户选片仍使用SelectionSet/SelectionItem；AI仍使用AnalysisResult。Pick不创建客户选片，Reject不删除照片、不改原图、不永久隐藏照片。
- 标记更新不改变PhotoEditDraft、RetouchVersion、Delivery或订单业务状态。
- P3-B1按Photo.id排序的签名游标、固定ID上界及缩略图cache identity不变。
- 原工作区已有大量未提交修改。没有Git清理、重置或覆盖无关工作；下面清单仅列本轮增量。

开始时全量基线：后端298通过/1跳过，前端266通过。证据目录保存基线和最终JUnit。

## 3. 数据模型及迁移

新增 `PhotoAssetAnnotation`，表名 `photo_asset_annotations`：

| 字段 | 规则 |
| --- | --- |
| id | 现有Integer自增主键约定 |
| photo_id / user_id | 指向Photo/User，ondelete CASCADE；user_id由认证身份产生 |
| rating | 严格整数0–5；默认语义0 |
| color_label | null或red/yellow/green/blue/purple；“无颜色”使用null |
| pick_status | unmarked / pick / reject；默认unmarked |
| revision | 非负整数，未创建时逻辑revision0，首次成功写入revision1 |
| created_at / updated_at | 现有UTC时间约定，响应补齐UTC时区 |

数据库约束：唯一 `(photo_id,user_id)`；rating范围、color枚举、pick枚举、revision非负CHECK；两个外键。唯一索引支持按照片/用户查询，另有user_id索引。读取不存在标记只返回默认值，**不创建行，不做默认值回填**。

新迁移：`c4e6a8b0d212_photo_asset_annotations.py`，down_revision为既有head `b2d4a6c8e010`。仅创建新表/索引/约束，downgrade只删除本表/索引；没有修改旧迁移文件或Photo/Order等业务模型。

隔离SQLite验证了升级、降级、空表无回填、外键及已有用户数据不变；生成了PostgreSQL兼容DDL。没有执行PostgreSQL在线验证。

真实开发SQLite仍为 `5e0b2fd720d3`，本轮没有自动补跑此前的P2-B迁移。上线时应审阅完整待执行迁移链，不能只按新表名称假设旧库已到上一版本。

## 4. API合同

三个接口均使用现有Bearer认证，仅允许订单所属摄影师；响应 `Cache-Control: private, no-store`。请求中的未知字段拒绝，原文件路径和业务身份不由客户端指定。

### 4.1 GET `/api/v1/photos/{photo_id}/annotation`

没有记录时：

```json
{
  "photo_id": 123,
  "rating": 0,
  "color_label": null,
  "pick_status": "unmarked",
  "revision": 0,
  "exists": false,
  "updated_at": null
}
```

有记录时返回同一形状，exists=true以及真实revision、UTC updated_at。

### 4.2 PUT `/api/v1/photos/{photo_id}/annotation`

完整快照，所有业务字段均必填；清除颜色需显式null：

```json
{
  "rating": 5,
  "color_label": "green",
  "pick_status": "pick",
  "expected_revision": 3
}
```

成功返回AnnotationResponse，revision4。已有行使用数据库条件UPDATE：照片、用户、expected_revision必须同时匹配；不是先读再无条件覆盖。

首次创建要求expected_revision0，由唯一约束解决并发创建。同版本的两个真实并发请求仅一个成功，另一个409；已有行并发更新同理。未使用Python进程锁作为一致性依据。

**幂等性政策：每次接受的完整快照，即使值未变化，也递增revision。** 使用旧expected_revision重放会409，不把超时重试当成无条件覆盖。单张冲突HTTP409，code为ANNOTATION_REVISION_CONFLICT，客户端需重新读取最新标记后明确决定重试。

rating拒绝布尔、字符串、浮点数及越界；revision拒绝布尔/负数，输入上界2147483646。非法枚举、未知字段、非法类型返回422。

### 4.3 POST `/api/v1/photos/annotations/batch`

```json
{
  "items": [
    {"photo_id": 123, "expected_revision": 3},
    {"photo_id": 124, "expected_revision": 0}
  ],
  "changes": {"rating": 5}
}
```

items为1–100项，拒绝重复ID；changes必须至少有一项，只允许rating、color_label、pick_status。rating/pick_status不能为null；color_label:null表示清除。只更新传入字段，保留其余字段。

响应示意，一项成功、一项冲突：

```json
{
  "results": [
    {"photo_id":123,"status":"success","annotation":{"photo_id":123,"rating":5,"color_label":"green","pick_status":"pick","revision":4,"exists":true,"updated_at":"2026-10-17T07:00:00Z"}},
    {"photo_id":124,"status":"conflict","annotation":{"photo_id":124,"rating":2,"color_label":null,"pick_status":"unmarked","revision":7,"exists":true,"updated_at":"2026-10-17T07:00:00Z"}}
  ],
  "succeeded": 1,
  "conflicted": 1
}
```

HTTP200表示请求已处理，不意味着全部成功；调用方必须检查每项status和汇总数。冲突项携带其当前服务端值，不丢弃、不伪装成功。

### 4.4 授权和事务边界

1. 用一次Photo JOIN Order查询授权全部ID；包含任何不可访问/不存在ID时统一403，**任何项目都不写入**，不返回不可访问照片的明细。
2. 已全部授权的批次在一个事务内顺序CAS更新。首次创建使用savepoint捕获唯一键竞争；revision冲突是可恢复结果，其余成功项可提交。
3. 返回结果使用一次范围查询，不逐张加载关联；不是每项单独查询Order。
4. 非预期SQL错误回滚整个请求，返回503/ANNOTATION_WRITE_FAILED；不会返回先前尚未提交项目的“成功”。此类失败是请求级错误，不伪造逐项成功/冲突列表。
5. 前端超过100项时拆成多个顺序请求，**跨请求不是一个大事务**。后续批次失败不会撤销前面已经提交的批次。
6. 网络断开可能发生在提交后。不能通过盲目重放判断结果；显式重试先读最新revision，再提交用户要求的字段。

其他状态：未认证401；非所属摄影师/客户/管理员403；单张照片不存在404；验证错误422。应用异常沿用现有 `{code,message,detail}` 格式。

## 5. 目录集成与查询性能

摄影师目录增加嵌套 `annotation` 对象；单张 `/orders/{order_id}/photos/{photo_id}/asset` 也携带该对象。客户响应annotation为null，查询不关联摄影师私有标记。

摄影师分页SQL在现有Photo查询中LEFT JOIN当前用户的Annotation，只选择当前页必要字段；没有每张照片额外读取注解或拉取整单所有标记。第一页面含认证与授权不超过4次SQL，查询测试通过。

不修改签名游标格式、Photo.id唯一排序、固定ID上界和分页大小，不把评分作为新排序字段。P3-B1的分页仍不是事务快照；并发删除/新增等一致性边界继续沿用原报告。

PhotoAsset增加 `rating/colorLabel/pickStatus/annotationRevision`，严格适配真实响应；默认对象与服务器默认语义相同。服务器标记保存在TanStack Query，不另建全局资产数据库。

## 6. 前端交互与状态

### 卡片和查看器

- 评分、颜色、标记显示在照片下方的小控件中，不覆盖照片。颜色有中文名称和细色条，不能仅靠颜色识别。
- 直接操作控件会停止事件冒泡，不打开查看器或改变多选。
- 卡片和查看器读取同一份Query中的PhotoAsset。成功写入只更新对应照片的目录页和单张元数据缓存，不刷新整个目录，不改变缩略图请求身份。
- 保存期间控件禁用，显示进度；查看器内同样显示待处理/冲突说明。
- 沿用既有图库路由 `/orders/:id/library` 及编辑器路径，本阶段没有新增前端路由或改动编辑算法。

### 多选规则

| 操作 | 结果 |
| --- | --- |
| 单击照片 | 单选该ID |
| Ctrl/Cmd单击 | 切换该ID，保留其他选择 |
| Shift单击 | 按已加载目录顺序选择锚点至目标范围，替换原选择 |
| Ctrl/Cmd+Shift单击 | 将范围并入已有选择 |
| 复选框 | 切换单项 |
| “查看”或双击 | 打开查看器 |
| 全选已加载 | 只选当前已加载记录，不代表数据库所有照片 |
| 清除选择 | 清空当前页面选择 |

选择源是稳定ID集合，与DOM挂载无关。密度和宽度变化不改变选择；加载更多不会自动选中新到达记录。目录中消失的ID被移除，不能因旧隐藏选择而误操作；范围依据数据顺序，不依据DOM顺序。切换订单/离开页面清空页面级选择，持久化标记不受影响。

### 快捷键优先级

仅图库网格有焦点时处理0–5评分、P保留、X拒绝、U清除Pick/Reject；有选中集合时作用于集合，否则作用于当前焦点照片。Ctrl/Cmd+A全选已加载，Escape清除选择。

input/textarea/select/contenteditable/textbox不触发图库快捷键；存在任何dialog时图库快捷键暂停。查看器由既有Modal处理Escape关闭，优先于图库清除选择。页面其他区域不注册全局评分按键，不拦截其浏览器操作。保存期间忽略新的元数据快捷键，待处理状态可见。

### 写入、乐观更新及重试

- 一个用户/订单同时一个操作，无自动写入队列；跨订单最多两个操作同时进行，每个操作按100项顺序提交，因此最多两个批量写请求并行。
- 同一订单的写入锁独立于虚拟卡片和页面组件。虚拟卡片卸载不取消持久化写入；离开再返回时仍显示busy，不能与尚未确认的请求竞争。
- 按用户/订单捕获Query key，旧订单晚到结果不能写入新订单缓存。返回旧revision的响应不能覆盖更高revision缓存。
- 每批先乐观更新本次字段，revision仍以服务端为准。失败时只恢复本次字段，不覆盖其他字段，也不回退更高revision。
- 冲突项展示服务端当前值，成功项保留。未解决提示出现时暂停新的标记修改，用户可选择“读取最新版本并重试失败项”或“保留服务器值，关闭提示”。
- 显式重试先读取失败项最新revision，再使用批量接口；不会逐张PUT几百次。读取失败的项目不写入，并继续列在错误范围内。
- 网络失败后停止后续分块，保留已确认成功项；不确定项和未提交项均进入显式重试范围。没有后台自动覆盖或自动删除。

当前错误列表显示前10个文件名及其余数量，重试范围包含全部失败ID。完整关闭浏览器会丢失页面内进度/失败提示；已提交标记仍在数据库，重新进入应读取当前值。本阶段不提供持久后台任务、跨标签全局互斥或离线写入恢复；跨标签一致性由数据库revision保证。

## 7. 新增与修改文件

以下均相对于仓库根目录：

| 文件 | 本轮变化 |
| --- | --- |
| `backend/app/models/photo_asset_annotation.py`（新增） | 独立标记模型和约束 |
| `backend/app/models/__init__.py` | 仅注册新模型 |
| `backend/alembic/versions/c4e6a8b0d212_photo_asset_annotations.py`（新增） | 增量迁移 |
| `backend/app/schemas/photo_annotation.py`（新增） | 严格单张/批量合同 |
| `backend/app/services/photo_annotation.py`（新增） | 批量授权、数据库CAS、事务及响应 |
| `backend/app/api/v1/photo_annotation.py`（新增） | 三个认证标记接口 |
| `backend/app/main.py` | 注册标记路由 |
| `backend/app/schemas/photo_catalog.py` | 可见范围内的嵌套annotation |
| `backend/app/services/photo_catalog.py` | 当前页LEFT JOIN |
| `backend/app/api/v1/photo_catalog.py` | 按角色控制标记可见性及单张元数据 |
| `backend/tests/test_photo_annotation.py`（新增） | API、权限、并发、回滚、迁移、查询和原图保护 |
| `backend/tests/test_draft_migration.py` | P2-B迁移测试目标固定为其自身revision，检查前刷新测试连接池schema状态；未改旧迁移 |
| `frontend/src/api/photoAnnotations.ts` 及 `.test.ts`（新增） | 标记DTO、认证请求、批量结果完整性校验 |
| `frontend/src/api/photoCatalog.ts` 及 `.test.ts` | PhotoAsset字段及适配测试 |
| `frontend/src/components/photo-library/AnnotationControls.tsx`（新增） | 卡片/查看器共用控件 |
| 同目录 `annotationLabels.ts`（新增） | 中文枚举文案 |
| 同目录 `selection.ts`（新增） | ID集合、范围和编辑目标判断 |
| 同目录 `BatchToolbar.tsx`（新增） | 已选计数、混合值、批量动作 |
| 同目录 `useAnnotations.ts`（新增） | 局部缓存更新、有限并发、冲突和重试 |
| 同目录 `annotations.test.tsx`（新增） | 乐观更新、分块、失败、重入和选择测试 |
| 同目录 `AssetGrid.tsx`、`PhotoViewer.tsx`、`photo-library.css` | 控件、多选、快捷键及局部样式 |
| 同目录 `library.test.tsx`、`PhotoViewer.test.tsx` | 新字段fixture及交互回归 |
| `frontend/src/pages/photographer/PhotoLibraryPage.tsx` 及 `.test.tsx` | 页面协调、选择、批量及错误恢复 |
| `frontend/src/pages/photographer/PhotoEditorPage.test.tsx` | 新字段fixture，产品编辑器实现未改 |
| `docs/image-processing-p3-b2.md` 及同名目录 | 报告、截图、JUnit、测量和保护证据 |

`.agentwork/p3-b2/` 为本轮隔离验收启动器和代理配置，不是产品接口。未修改ThumbnailPool、图像引擎、首页、全局设计系统和既有Photo/Order/Selection/Analysis/Retouch/Delivery模型。

## 8. 测试命令和实际结果

```powershell
# backend工作目录
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest tests/test_photo_annotation.py tests/test_photo_catalog.py tests/test_draft_migration.py -q --junitxml=../.agentwork/p3-b2/targeted-backend.xml
../.agentwork/design-system/p5-venv/Scripts/python.exe -m pytest -q --junitxml=../.agentwork/p3-b2/backend-tests.xml

# frontend工作目录
npx --no-install tsc -b
npm run build
npx --no-install vitest run --reporter=default --reporter=junit --outputFile=../.agentwork/p3-b2/frontend-tests.xml
npm run lint
```

| 检查 | 实际结果 |
| --- | --- |
| 后端目标组合 | 34 passed，48.40s |
| 后端全量 | 321 passed、1 skipped、9 warnings，255.75s |
| 前端最终全量 | 279 passed、45 files，17.87s |
| TypeScript / build | 退出码0 |
| 生产图库chunk | JS55.09kB，gzip18.47kB；还需计共享chunk成本 |
| Lint | 退出码0；4 warnings，无新增最终警告 |

后端跳过 `test_symlink_cannot_escape`，原因为Windows不允许测试符号链接。警告为既有Starlette/httpx及Alembic path_separator弃用提示。Lint保留P3-B1已有的ParticlePortrait依赖1条、DarkroomVideoBackground effect2条、TanStack Virtual/React Compiler兼容1条。

Vitest仍出现既有Toast act、jsdom Canvas未实现及一次CSS解析器迭代提示；测试最终均通过，这不代表jsdom进行了真实JPEG绘制。

开发中修正了新测试参数名与pytest保留名冲突、测试缺少Path import、SQL计数混入测试本身的过期ORM访问，以及组合DDL测试的SQLite连接池schema反射状态。最终目标和全量测试均重新执行通过，没有跳过这些失败断言。

开发时向正在运行的自定义hook加入新hook曾触发Vite热更新的Hook顺序告警并重挂页面；最终函数没有条件调用hook，回归及重挂后的真实页面正常。该开发过程告警不作为生产功能验证成功的依据。

## 9. 真实浏览器及HTTP独立证据

专用FastAPI `127.0.0.1:8049`，专用Vite `127.0.0.1:4249`；临时根目录：

`C:/Users/Chase/AppData/Local/Temp/lensflow-p3b2-browser-f22h2rvp`

内部使用独立browser.sqlite、uploads及同级缩略图缓存；仅这个库升级到新head。订单1有1000条元数据，复用8个真实JPEG文件；另一个摄影师的订单含1条不可访问照片。没有宣称1000张独立原图。

实际步骤与结果：

1. 登录测试摄影师，照片A评分5、绿色、Pick，刷新后仍为5/green/pick。
2. 照片B设Reject后仍显示、可读取，原文件没有删除。
3. 选择第1及第7张跨行照片，批量评分4；A的green/pick保留。
4. 查看器显示相同元数据；进入既有P3-A编辑器并返回，标记仍在。
5. 第二页面更新A为3，第一页用旧revision提交2。批量响应的该项为conflict，UI显示服务器3和显式重试入口；用户触发重试后才写为2。
6. 独立认证HTTP对单张PUT发送旧revision0，实际得到409。批量含不可访问ID实际403，授权照片及隐藏照片均未改变。
7. 实际Ctrl单击、Shift单击得到按数据顺序的3–9选择范围。
8. 重新选择1和7，浏览到1000条，两项都已离屏卸载，已选仍为2；批量操作仍修改正确ID。
9. 全选1000条已加载照片并批量评分3，10次POST，0次目录请求，0次缩略图请求，全部1000项确认成功。
10. 数据库复核：1000个标记均评分3；A仍green/pick，B仍reject；8个原图SHA256全部不变。SelectionSet/Item、AnalysisResult、PhotoEditDraft、RetouchVersion及Delivery均为0条，未发生业务串写。

最后一轮浅色页面复核A为3/green/pick，第一张重新挂载正常，选择计数仍为2。A从5改为3是后续显式批量/冲突验收操作，不是刷新丢失。

### 截图

深色批量操作后的实际卡片：

![深色批量标记](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b2/batch-dark.png)

双会话冲突和解决入口：

![双会话标记冲突](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b2/two-session-conflict.png)

浅色图库与元数据控件：

![浅色图库](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b2/final-library-light.png)

最终浅色查看器：

![浅色查看器](C:/Users/Chase/Desktop/LensFlow/docs/image-processing-p3-b2/final-viewer-light.png)

## 10. 大目录测量及边界

`large-selection-measurements.json`记录实际19次增量翻页至1000条，选择计数始终2。该轮标准密度采样挂载18–21张卡片，尾部10张，未挂载1000张。密度切换采样为紧凑20张、宽松12张且选择不变；该密度采样发生在紧凑卡片详情区最终加高之前，不能当成最终布局的精确峰值保证。最终布局仍经过虚拟器挂载边界及密度选择回归测试。

`large-batch-verification.json`：1000项全选评分，自动化计时约962ms，实际10次批量POST、0目录重取、0缩略图请求。包含本机浏览器自动化及网络等待，**不是纯接口时延、FPS或跨设备性能承诺**。

一次较早的两项批量测量与滚动后缩略图收尾请求交叠，不能据此把所有新日志都归因于元数据变更；1000项独立操作窗口已排除该歧义。

没有5000张独立大图、低端设备、GPU/FPS和长期堆内存测量。虚拟化与缩略图资源预算沿用P3-B1；本阶段增加的是轻量元数据和ID集合。

## 11. 数据保护、清理与部署

- `protected-resources.json`检查91个敏感文件，90个字节不变；唯一变化是models/__init__.py注册新类，将新增注册两行移除后哈希与开始一致。
- 保护集包括开发DB、既有模型/迁移、图像引擎、草稿、编辑器、首页及视觉系统。没有修改原JPEG或执行开发库create_all/drop_all/upgrade。
- pytest沿用导入前fail-closed临时SQLite、独立上传目录、后台Session及通知隔离，开发存储哈希guard通过。
- 测试结束关闭本轮标签17/18、专用8049/4249服务；浏览器临时DB、上传和缓存根目录实际已删除。没有停止用户原服务。详情见cleanup.json。
- 部署需先审阅待执行迁移链并受控升级；本报告不代表开发库已经具备新表。
- SQLite短写事务CAS与并发创建已验证；PostgreSQL只有离线DDL验证，在线执行/锁行为留作对应环境验收。
- 页面离开后已授权写入可以完成，旧订单缓存被正确更新；完整关闭进程后没有持久任务进度恢复。网络结果不确定时须读取最新revision，不盲目重试。

## 12. P3-B3接入建议（未实施）

- 过滤与评分排序需要独立索引/游标身份设计，不能直接在当前分页结果前端过滤后声称完整查询。
- Light Table可复用PhotoAsset标记、认证预览和稳定ID选择，仍需单独规划多图解码内存。
- 若需AI建议评分，应独立存储建议来源，由用户显式接受，不覆盖人工标记。
- 批量像素编辑、导出及发布继续独立于资产组织元数据；不可把Pick自动转成客户选片或Delivery。

P3-B2在此结束，没有自动进入下一阶段。
