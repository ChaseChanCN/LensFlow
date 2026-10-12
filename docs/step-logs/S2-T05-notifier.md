# S2-T05 通知抽象层与发送记录

## 实现目的

实现 Notifier 抽象基类和 BarkNotifier 实现，包含失败重试（最多 3 次指数退避）、发送记录写入 NotificationLog、通知与业务状态解耦。通知失败不抛异常，只记录 failed 状态。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `app/services/notifier.py` | Notifier ABC + BarkNotifier + WechatWorkNotifier + get_notifier 工厂 |
| `tests/test_notifications.py` | 5 个测试 |

### 关键设计

1. **Notifier ABC**：`send(db, title, body, ...)` 方法封装重试和日志，子类只需实现 `_send`。
2. **重试逻辑**：最多 3 次，指数退避（2s, 4s, 8s），通过 `time.sleep`（测试中 mock）。
3. **发送记录**：每次发送写 NotificationLog（channel, target, template, payload, status, retry_count, error_message, sent_at）。
4. **通知与状态解耦**：通知失败不抛异常，只返回 failed 状态的 log。调用方根据 log.status 判断结果。
5. **BarkNotifier**：POST JSON 到 Bark 服务器，含 title/body/category。
6. **WechatWorkNotifier**：POST 到企业微信 webhook，msgtype=text。

### 测试结果

```
5 passed

test_send_success: 成功发送，status=sent
test_send_failure_with_retry: 3次重试后failed，retry_count=3
test_send_retry_then_success: 第1次失败第2次成功，retry_count=1
test_send_logs_to_db: 记录写入DB，含template和related_order_id
test_notification_does_not_raise: 失败不抛异常
```

## 改进之处

- 通知失败不影响业务流程，只记录日志。
- 重试使用指数退避，避免频繁重试。
- 支持多渠道：Bark 和企业微信已实现，通过配置切换。
- 发送记录完整，可查询历史和统计成功率。

## 存在的问题

- `time.sleep` 在重试时会阻塞，生产环境应改为异步（P2 Celery）。
- Bark/企业微信凭据待人工获取（Q7/Q8），当前测试用 mock。
- 无通知频率控制/防骚扰，待 P1 实现。

## 验收标准

- [x] 发送成功 -> log status=sent
- [x] 发送失败 -> 重试 3 次后 status=failed
- [x] 重试后成功 -> retry_count 记录正确
- [x] 通知失败不抛异常
- [x] 发送记录写入 NotificationLog
- [x] 5 个测试全部通过
