# S2-T03 统一错误处理与 API 封装

## 实现目的

完善前后端统一错误处理机制，确保所有错误返回统一格式，前端能正确解析和展示错误信息。

## 如何实现

### 后端（S1 已完成基础）

- `app/core/exceptions.py`：统一异常体系（AppException + 6 个子类），统一 handler 返回 `{code, message, detail}`。
- `app/main.py`：已注册 `app_exception_handler` 和 `generic_exception_handler`。

### 前端（本次完善）

- `src/api/client.ts`：Axios 响应拦截器，401 自动清除 token 并跳转登录。
- `src/api/auth.ts`：新增 `extractErrorMessage(error)` 工具函数，从 AxiosError 中提取统一错误消息。

### 测试

后端错误格式已在 `test_health.py::test_error_format` 和 `test_auth.py` 中验证（401/403/409/422 均返回统一格式）。

## 改进之处

- 前端 `extractErrorMessage` 统一提取错误消息，页面无需重复解析。
- 401 拦截器自动跳转登录，无需每个请求手动处理。

## 存在的问题

- 前端尚未引入 Toast/Message 组件，错误提示待 S2-T02 接入 AntD message。

## 验收标准

- [x] 后端 400/401/403/404/409/422/500 返回统一 `{code, message, detail}` 格式
- [x] 前端 Axios 拦截器处理 401
- [x] extractErrorMessage 工具函数可用
