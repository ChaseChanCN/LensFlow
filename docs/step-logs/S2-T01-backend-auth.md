# S2-T01 后端认证服务

## 实现目的

实现用户注册、登录、登出、获取当前用户信息的完整认证流程，使用 JWT 令牌和 bcrypt 密码哈希，提供 RBAC（基于角色的访问控制）依赖注入，为后续所有受保护接口提供鉴权基础。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `app/core/security.py` | bcrypt 密码哈希 + JWT 签发/验证 |
| `app/types.py` | UserRole 类型定义 |
| `app/schemas/auth.py` | 请求/响应 DTO（register/login/me） |
| `app/deps.py` | get_current_user + require_role 依赖注入 |
| `app/api/v1/auth.py` | 认证路由（register/login/logout/me） |
| `tests/test_auth.py` | 11 个认证测试 |

### 关键设计

1. **JWT**：使用 python-jose，token 包含 `sub`（用户 ID）和 `role`，过期时间从配置读取。
2. **密码哈希**：passlib + bcrypt，不可逆存储。
3. **RBAC**：`require_role("photographer")` 返回依赖函数，角色不匹配抛 403。
4. **OAuth2PasswordBearer**：FastAPI 标准认证依赖，Swagger UI 显示登录按钮。
5. **注册即登录**：注册成功直接返回 token，无需再次登录。

### 测试结果

```
11 passed in 4.60s

TestRegister: 4 tests (client注册/photographer注册/重复邮箱/短密码)
TestLogin: 3 tests (成功/错误密码/不存在用户)
TestMe: 3 tests (带token/无token/无效token)
TestLogout: 1 test (带token登出)
```

## 改进之处

- 注册返回 token + user 信息，前端无需二次请求。
- require_role 支持多角色：`require_role("photographer", "admin")`。
- 测试使用 dependency_overrides 隔离数据库，每个测试自动建表/删表。
- EmailStr 校验邮箱格式，密码最小 6 位。

## 存在的问题

1. **无 token 黑名单**：logout 不使 token 失效（JWT 无状态），前端自行清除。如需服务端失效需引入 Redis（P2）。
2. **无刷新 token**：当前只有 access token，过期需重新登录。MVP 可接受。
3. **passlib 弃用警告**：Python 3.13 将移除 crypt 模块，passlib 有警告。暂不影响 3.12。

## 验收标准

- [x] 注册返回 201 + JWT + user
- [x] 登录返回 200 + JWT + user
- [x] /me 带 token 返回用户信息
- [x] /me 无 token 返回 401
- [x] 重复邮箱返回 409
- [x] 错误密码返回 401
- [x] 11 个测试全部通过
