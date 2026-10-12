# S2-T02 前端登录与路由守卫

## 实现目的

将前端登录/注册页面接入后端认证 API，实现路由守卫（未登录跳转登录页），登录成功后存储 token 和用户信息并跳转工作台。

## 如何实现

### 修改的文件

| 文件 | 变更 |
|---|---|
| `src/pages/auth/LoginPage.tsx` | 接入 login API，loading/error 状态，成功后跳转 |
| `src/pages/auth/RegisterPage.tsx` | 接入 register API，角色选择，成功后跳转 |
| `src/components/ProtectedRoute.tsx` | 新增：路由守卫，检查 isAuthenticated |
| `src/App.tsx` | 使用 ProtectedRoute 包裹工作台/订单/客户路由 |
| `src/pages/auth/LoginPage.test.tsx` | mock API，更新测试 |
| `src/components/ProtectedRoute.test.tsx` | 新增：守卫测试（未认证跳转/认证通过） |

### 关键设计

1. **API 调用**：LoginPage/RegisterPage 调用 `@/api/auth` 的 login/register，成功后 `setToken` + `setUser` + `navigate('/')`。
2. **错误展示**：简约红色提示框，使用 `extractErrorMessage` 提取后端错误消息。
3. **Loading 状态**：按钮禁用 + 文字变为"登录中..."，防止重复提交。
4. **路由守卫**：ProtectedRoute 检查 `useAuthStore.isAuthenticated`，未认证 `<Navigate to="/login" />`。
5. **注册即登录**：注册成功直接返回 token，无需二次登录。

### 测试结果

```
3 test files, 7 tests passed
tsc --noEmit: 无错误
```

## 改进之处

- 所有页面保持简约风格，无 emoji。
- label 全部通过 htmlFor/id 关联，无障碍合规。
- ProtectedRoute 可复用，后续新增受保护路由只需包裹。
- 测试 mock API 层，不依赖后端运行。

## 存在的问题

- 无 token 过期自动刷新，token 过期后 401 拦截跳转登录。
- 无"记住我"功能，刷新页面靠 localStorage 保持登录态。
- 注册页未做密码确认（两次输入），待后续增强。

## 验收标准

- [x] 登录页接入后端 API
- [x] 注册页接入后端 API
- [x] 路由守卫未认证跳转登录
- [x] 登录成功跳转工作台
- [x] 错误信息正确展示
- [x] 7 个测试全部通过
- [x] TypeScript 编译无错误
