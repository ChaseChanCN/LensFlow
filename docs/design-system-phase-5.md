# Phase 5 全系统验收

日期：2026-10-16 · 分支：`design-system`

**结论：验收已执行，最终门禁未通过（NOT_ACCEPTED）。** 设计系统实现与自动检查已有结果；真实接口发现两项越权读取，现有 UI 业务流程存在缺口，真实屏幕阅读器听读尚未完成。不能据此宣布全系统可发布。

## 本轮修复

- 成片下载改用带 JWT 的 API 请求获取 Blob，按钮提供加载和错误反馈；真实浏览器下载 ZIP 与接口内容逐字节一致。
- 后端依赖声明改为 `pydantic[email]`，解决全新环境缺少 `email-validator` 导致启动失败。
- 粒子页标题与入口立即可见，保留粒子几何、着色器及交互；补充中文语言与 main 地标。
- 首页 iframe 消除外层多余高度；入口消息限定同源和允许的导航路径，并补充测试。

## 验收结果

| 检查 | 结果 | 范围与限制 |
|---|---|---|
| 前端单元测试 | 129/129 通过 | 包含认证下载、Blob 清理、入口消息限制 |
| 后端单元测试 | 145/145 通过 | 独立 SQLite；1 条 Starlette/httpx 弃用警告 |
| 核心组件测试 | 48/48 通过 | UI 组件与 PageState |
| 核心组件覆盖率 | 行 100%、语句 97.72%、函数 98.38%、分支 94.93% | 不是全应用覆盖率 |
| 类型与生产构建 | 通过 | `tsc -b && vite build` |
| Lint | 0 错误、2 条既有警告 | 当前工具为 oxlint，警告来自 DarkroomVideoBackground |
| 令牌与对比度 | 115 个变量、121 个工具类候选、12 组对比通过 | 自动脚本检查 |
| 自动无障碍 | 16 项均 100 分 | 14 个业务页、首页、粒子页；初始状态及填充夹具 |
| 响应式 | 45 个页面/宽度组合无横向溢出 | 375/768/1280px；首页外层无额外高度 |
| 真实 API | 38/40 通过 | 两项所有权检查失败，见下文 |
| 真实浏览器 | 登录、预约提交和返回列表、认证下载通过 | API 已准备订单数据；不是完整浏览器业务链通过 |
| Modal 键盘交互 | 嵌套 Escape、焦点返回、滚动锁恢复通过 | 开发组件展示页 |
| 真实读屏听读 | 待人工完成 | 不能由 Lighthouse 或可访问树代替 |

### 性能与体积

桌面 Edge/Lighthouse，同一配置交替测量修改前后各三次，直接测量 `/lensflow-v24.html`，原始样本均保留。

| 指标 | P1 原始基线 | 本轮修改前 | P5 修改后 |
|---|---:|---:|---:|
| 性能评分中位数 | 96 | 93（93/97/89） | 97（99/97/91） |
| FCP 中位数 | 992.82ms | 1177.07ms | 800.41ms |
| LCP 中位数 | 1085.80ms | 1205.38ms | 800.41ms |
| RAF 回调频率 | 59.994Hz | 本轮 trace 保留 | 59.992Hz 中位数 |
| 生产文件总量 | 843,904 bytes | P4：868,587 bytes | 868,615 bytes |

普通动效模式满足计划中的相对性能目标。体积比原始基线增加约 2.93%，比 P4 增加 28 bytes。RAF 是回调频率，排除开始 500ms，不能等同于 GPU 实际呈现帧率。外部字体、Three.js CDN 和动画 Speed Index 存在采样波动；91 分样本未剔除。根首页包含 iframe，直接粒子页指标不代表外层根页面的 LCP。

减少动态效果模式实际渲染了静态肖像、标题和入口，trace 中 RAF 回调为 0，功能检查通过。该模式单次性能为 **87 分**，FCP/LCP 约 1185ms；未进行三次配对性能验收，因此没有将其标记为性能门禁通过。

## 已知问题与阻断项

这些业务逻辑在本轮设计系统改动前已经存在；接口行为已实测，UI 缺口通过现有实现和 HEAD 对照确认。依照方案的业务边界，本轮记录为独立修复项。

| 编号 | 级别 | 证据 | 修复后验收条件 |
|---|---|---|---|
| P5-01 | 阻断 | 其他客户 GET `/api/v1/bookings/2` 返回 200，预期 403；`bookings.py:get_booking` 未校验归属 | 非所属客户无法读取预约，所属客户与授权摄影师仍可访问 |
| P5-02 | 阻断 | 其他客户 GET `/api/v1/orders/2` 返回 200，预期 403；`orders.py:get_order` 未校验归属 | 订单详情正确校验归属与角色 |
| P5-03 | 阻断 | `_run_analysis` 保存分析但停留 ANALYZING；订单页 NEXT_ACTIONS 无推进到 WAITING_REVIEW 的入口 | 上传、分析、复核能从 UI 连贯完成 |
| P5-04 | 阻断 | “发布选片集”只更新状态，没有创建 selection set | UI 调用创建接口，客户能加载并提交实际选片集 |
| P5-05 | 阻断 | “上传最终成片”直接变为 DELIVERED，未上传文件；真正上传表单位于交付管理 | 状态与文件上传绑定，不产生无成片的已交付订单 |
| P5-06 | 待完成 | 未执行真实屏幕阅读器听读 | 完成并签署人工检查表 |
| P5-07 | 跟进 | 减少动态效果模式仅单次 87 分 | 同配置重复测量并评估该模式性能 |

API 验收确实完成预约、JPEG 上传、真实分析、复核、创建选片集、提交选片、修图预览/反馈/确认、ZIP 上传、下载及归档；其中状态推进和选片集创建由脚本明确调用 API。下载、交付详情及列表的客户隔离检查通过，不能据此推断其他端点全部安全。

## 环境与复现

独立 Python 3.12.10 虚拟环境，真实 FastAPI/JWT/SQLAlchemy/Alembic、SQLite、本地文件存储及图像分析。未使用用户现有数据库、上传目录或修改 `.env`。验收服务显式禁用对外通知，通知发送能力不在本轮结果中；生产 PostgreSQL、云存储未验收。

从仓库根目录执行（PowerShell，服务分别占用终端）：

```powershell
python -m venv .agentwork/design-system/p5-venv
& ./.agentwork/design-system/p5-venv/Scripts/python.exe -m pip install -e './backend[dev]'
& ./.agentwork/design-system/p5-venv/Scripts/python.exe backend/scripts/run_design_system_acceptance.py
# 另一个终端：先构建，再启动真实后端代理
pnpm --dir frontend build
node frontend/scripts/serve-system-acceptance.mjs
# 第三个终端：注册一次性本地账号并执行 API 验收
& ./.agentwork/design-system/p5-venv/Scripts/python.exe backend/scripts/check_design_system_flow.py
```

代理服务为 `http://127.0.0.1:4206`，真实接口为 8008。代理只在返回的 JS 中将开发环境 localhost API 地址改为同源；磁盘构建文件不变，没有 API 夹具或注入登录。API 检查当前因两项已知失败返回退出码 1；重复运行会新增本地验收账号和记录。账号、密码、JWT 仅保存在被忽略的 `.agentwork` 中，不纳入报告。

## 证据与文档

- [机器结果、全部性能样本与构建哈希](design-system-phase-5-results.json)
- [人工读屏检查表](design-system-accessibility-checklist.md)
- [设计系统文档入口](design-system.md)
- [首页桌面截图](design-system-screenshots/phase-5-landing.jpg) / [移动截图](design-system-screenshots/phase-5-landing-mobile.jpg)
- [真实预约提交](design-system-screenshots/phase-5-real-booking.jpg) / [真实认证交付页](design-system-screenshots/phase-5-real-delivery.jpg)
- [减少动态效果静态渲染](design-system-screenshots/phase-5-reduced-motion.jpg)

本地原始报告位于 `.agentwork/design-system/p5-*`（被忽略的工作材料）。后续应先修复上述归属校验和 UI 业务衔接，再重新执行真实流程与人工读屏；全部门禁通过后才能将 P5 标为验收完成。
