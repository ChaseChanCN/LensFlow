# API 接口清单

所有接口前缀: `/api/v1`

## 认证

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /auth/register | 注册 | 公开 | 待实现 (S2-T01) |
| POST | /auth/login | 登录，返回 JWT | 公开 | 待实现 (S2-T01) |
| POST | /auth/logout | 登出 | 已认证 | 待实现 (S2-T01) |
| GET | /auth/me | 当前用户信息 | 已认证 | 待实现 (S2-T01) |

## 预约

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /bookings | 提交预约 | client | 待实现 (S3-T01) |
| GET | /bookings | 预约列表 | 已认证 | 待实现 (S3-T01) |
| GET | /bookings/{id} | 预约详情 | 已认证 | 待实现 (S3-T01) |
| PATCH | /bookings/{id}/confirm | 确认预约 | photographer | 待实现 (S3-T01) |
| PATCH | /bookings/{id}/cancel | 取消预约 | 已认证 | 待实现 (S3-T01) |

## 订单

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| GET | /orders | 订单列表 | 已认证 | 待实现 (S3-T02) |
| GET | /orders/{id} | 订单详情 | 已认证 | 待实现 (S3-T02) |
| PATCH | /orders/{id}/status | 状态流转 | 按角色 | 待实现 (S3-T03) |
| GET | /orders/{id}/timeline | 操作记录 | 已认证 | 待实现 (S3-T04) |

## 图片

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /orders/{id}/photos | 上传图片 | photographer | 待实现 (S4-T01) |
| GET | /orders/{id}/photos | 图片列表 | 已认证 | 待实现 (S4-T02) |
| DELETE | /orders/{id}/photos/{photo_id} | 删除图片 | photographer | 待实现 (S4-T02) |

## 分析

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /photos/{id}/analyze | 触发分析 | system | 待实现 (S4-T05) |
| GET | /photos/{id}/analysis | 获取结果 | 已认证 | 待实现 (S4-T03) |
| PATCH | /analysis/{id}/review | 人工复核 | photographer | 待实现 (S4-T06) |

## 选片

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /orders/{id}/selection-set | 发布选片集 | photographer | 待实现 (S5-T01) |
| GET | /selection-sets/{id} | 查看选片集 | client | 待实现 (S5-T02) |
| POST | /selection-sets/{id}/submit | 提交选片 | client | 待实现 (S5-T03) |
| GET | /selection-sets/{id}/submission | 提交结果 | 已认证 | 待实现 (S5-T03) |

## 修图

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| GET | /orders/{id}/retouch-tasks | 任务列表 | 已认证 | 待实现 (S5-T04) |
| POST | /retouch-tasks/{id}/versions | 上传预览 | photographer | 待实现 (S5-T05) |
| POST | /retouch-tasks/{id}/feedback | 客户反馈 | client | 待实现 (S5-T06) |
| PATCH | /retouch-tasks/{id}/status | 更新状态 | photographer | 待实现 (S5-T04) |

## 交付

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| POST | /orders/{id}/delivery | 上传最终成片 | photographer | 待实现 (S6-T03) |
| GET | /orders/{id}/delivery | 交付信息 | 已认证 | 待实现 (S6-T03) |
| GET | /delivery/{id}/download | 下载成片 | 已认证 | 待实现 (S6-T04) |

## 通知

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| GET | /notifications | 发送记录 | photographer | 待实现 (S2-T05) |
| POST | /notifications/test | 发送测试 | photographer | 待实现 (S2-T05) |

## 待办

| 方法 | 路径 | 说明 | 角色 | 状态 |
|---|---|---|---|---|
| GET | /todos | 待办列表 | 已认证 | 待实现 (S3-T05) |
| PATCH | /todos/{id} | 标记完成 | 已认证 | 待实现 (S3-T05) |

## 系统接口（已实现）

| 方法 | 路径 | 说明 | 状态 |
|---|---|---|---|
| GET | /health | 健康检查 | 已实现 |
| GET | / | 根路径信息 | 已实现 |
| GET | /docs | Swagger UI | 已实现 |

## 统一错误格式

所有错误返回统一 JSON 格式：

```json
{
  "code": "ERROR_CODE",
  "message": "错误描述",
  "detail": "详细信息"
}
```

| HTTP 状态码 | code | 说明 |
|---|---|---|
| 400 | VALIDATION_ERROR | 参数校验失败 |
| 401 | UNAUTHORIZED | 未认证 |
| 403 | FORBIDDEN | 权限不足 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 状态冲突/非法转换 |
| 422 | VALIDATION_ERROR | 校验失败 |
| 500 | INTERNAL_ERROR | 内部错误 |
