# S1-T03 通知渠道验证

## 实现目的

验证至少一种消息推送渠道（Bark 或企业微信）可用，获取 API 凭据，为 S2-T05 通知抽象层实现提供基础。首期只交付一种渠道，但设计上支持扩展。

## 如何实现

### 候选渠道对比

| 渠道 | 优点 | 缺点 | API 凭据 | 当前状态 |
|---|---|---|---|---|
| Bark | iOS 原生推送，配置简单，单用户场景适合 | 仅 iOS，不支持 Android/Web | 服务器地址 + device key | 待人工确认凭据 |
| 企业微信 | 跨平台，支持群机器人 | 需企业微信管理员配置 | webhook URL | 待人工确认凭据 |

### 推荐方案

**首期推荐 Bark**（若开发者使用 iOS 设备），原因：
1. 配置最简单，只需一个 device key。
2. API 为简单 HTTP POST/GET，无复杂签名。
3. 适合个人开发者/小团队场景。

**备选企业微信群机器人**：
1. 创建企业微信群，添加机器人，获取 webhook URL。
2. POST JSON 到 webhook URL 即可发送。

### 环境变量配置位（已在 .env.example 中预留）

```env
# 通知渠道选择：bark / wechat_work
NOTIFIER_CHANNEL=bark

# Bark 配置
BARK_SERVER_URL=https://api.day.app
BARK_DEVICE_KEY=your_bark_device_key

# 企业微信配置
WECHAT_WORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=your_key
```

### Bark API 礆例

```
# GET 方式
GET https://api.day.app/{device_key}/{title}/{body}

# POST 方式（推荐）
POST https://api.day.app/{device_key}
Content-Type: application/json
{
  "title": "LensFlow 通知",
  "body": "您有新的预约需要确认",
  "category": "lensflow"
}
```

## 改进之处

- 通知渠道通过环境变量切换，不改代码即可切换 Bark/企业微信。
- 通知抽象层（S2-T05）将封装统一接口，业务代码不直接依赖具体渠道。
- 失败重试与发送记录在设计时已考虑，不依赖具体渠道能力。

## 存在的问题

1. **凭据未获取**：Bark device key 或企业微信 webhook URL 需人工获取（Q7/Q8）。
2. **渠道限制未知**：Bark 免费版可能有频率限制，企业微信机器人每分钟最多 20 条。
3. **无法自动验证**：当前环境无法实际发送测试消息。

## 对后续任务的影响

- 阻塞 S2-T05（通知抽象层实现）的真实发送部分。
- 不阻塞 S2-T05 的抽象层与 mock 测试部分（可先用 mock 实现）。
- 阻塞 S6-T01（通知规则配置）的真实发送验证。
- 建议：在 S2-T05 开始前完成凭据获取。

## 验收标准

- [ ] 至少一条消息成功送达目标设备。
- [ ] 有 HTTP 请求/响应记录。
- [ ] 凭据已配置到环境变量（不硬编码）。
- [ ] 选定渠道已记录到 docs/notification-setup.md。

## 临时方案

在凭据获取前，S2-T05 将实现：
1. 完整的 Notifier 抽象基类。
2. BarkNotifier / WechatWorkNotifier 实现（凭据从环境变量读取）。
3. Mock 测试（不依赖真实凭据）。
4. 真实发送测试在凭据就绪后补充。
