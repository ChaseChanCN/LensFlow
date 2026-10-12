# S1-T05 前端项目骨架

## 实现目的

创建 Vite + React + TypeScript 前端项目，配置 AntD、Tailwind CSS v4、React Router、Zustand、TanStack Query、Axios，建立路由骨架和简约风格页面占位，为后续业务页面开发提供基础。

## 如何实现

### 创建的文件

| 文件 | 作用 |
|---|---|
| `frontend/vite.config.ts` | Vite 配置：Tailwind 插件、API 代理、vitest 配置、路径别名 |
| `frontend/.env.example` | 环境变量（API 地址、应用名） |
| `frontend/src/index.css` | Tailwind v4 指令 + 全局简约样式 |
| `frontend/src/main.tsx` | 应用入口 |
| `frontend/src/App.tsx` | 路由配置（BrowserRouter + QueryClient） |
| `frontend/src/api/client.ts` | Axios 实例 + 请求/响应拦截器（JWT、401 跳转） |
| `frontend/src/types/index.ts` | 类型定义（User、Order、OrderStatus、ApiError） |
| `frontend/src/stores/auth.ts` | Zustand auth store（token、user、logout） |
| `frontend/src/components/Layout.tsx` | 简约布局组件（header + nav + main） |
| `frontend/src/pages/auth/LoginPage.tsx` | 登录页（简约卡片式） |
| `frontend/src/pages/auth/RegisterPage.tsx` | 注册页（含角色选择） |
| `frontend/src/pages/photographer/DashboardPage.tsx` | 摄影师工作台占位 |
| `frontend/src/pages/client/ClientPage.tsx` | 客户交付页占位 |
| `frontend/src/pages/NotFoundPage.tsx` | 404 页 |
| `frontend/src/test-setup.ts` | vitest 测试设置 |
| `frontend/src/pages/NotFoundPage.test.tsx` | 404 页测试 |
| `frontend/src/pages/auth/LoginPage.test.tsx` | 登录页测试 |

### 关键设计

1. **简约风格**：所有页面使用 Tailwind 灰色系，无 emoji，无多余装饰。卡片式登录/注册，顶部导航栏工作台。
2. **Tailwind v4**：使用 `@tailwindcss/vite` 插件，`@import "tailwindcss"` 指令，无需 postcss 配置。
3. **API 代理**：Vite dev server 代理 `/api` 到后端 `localhost:8000`，开发时无跨域问题。
4. **Axios 拦截器**：请求自动携带 JWT，401 自动跳转登录页。
5. **Zustand auth store**：token 持久化到 localStorage，提供 setUser/setToken/logout。
6. **路由骨架**：/login、/register、/（工作台）、/client、/404，未匹配路由重定向到 404。

### 测试结果

```
Test Files  2 passed (2)
Tests       4 passed (4)

vite build: 75 modules transformed, built in 183ms
tsc --noEmit: 无错误
```

## 改进之处

- 页面严格遵循简约风格，无 emoji，使用灰黑白色系。
- label 和 input 通过 htmlFor/id 关联，符合无障碍标准。
- 路径别名 `@/` 简化导入路径。
- TanStack Query 已集成，后续数据请求可直接使用。
- 类型定义中已包含 OrderStatus 全部 14 个状态，为 S3 订单模块做准备。

## 存在的问题

1. **AntD 未实际使用**：当前页面用 Tailwind 实现，AntD 已安装但未引入。后续工作台复杂页面可按需引入 AntD 组件。
2. **无 API 调用**：页面为占位，未实际调用后端 API（待 S2-T01 后端认证完成后接入）。
3. **路由守卫未实现**：当前路由未做登录守卫，待 S2-T02 实现。
4. **Tailwind v4 无 tailwind.config.js**：v4 使用 CSS 内配置，如需自定义主题需在 index.css 中用 `@theme` 指令。

## 验收标准

- [x] `npm run dev` 可启动（vite dev server）
- [x] `npm run build` 成功
- [x] `tsc --noEmit` 无错误
- [x] 4 个测试全部通过
- [x] 页面无 emoji，简约风格
- [x] `.env.example` 配置完整
