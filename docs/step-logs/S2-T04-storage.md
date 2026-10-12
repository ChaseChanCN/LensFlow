# S2-T04 存储抽象层

## 实现目的

实现 Storage 抽象基类和 LocalStorage 实现，使业务代码通过统一接口操作文件，不直接依赖具体存储。本地开发使用文件系统，生产切换 OBS 时只需新增 OBSStorage 实现。

## 如何实现

### 创建的文件

| 文件 | 内容 |
|---|---|
| `app/services/storage.py` | Storage ABC + LocalStorage + get_storage 工厂 |
| `tests/test_storage.py` | 8 个测试 |

### 关键设计

1. **Storage ABC**：4 个抽象方法（save, get_path, delete, exists）。
2. **LocalStorage**：使用 UUID + 原扩展名生成 storage_key，避免文件名冲突。
3. **get_storage()**：工厂函数，根据 `settings.storage_type` 返回对应实现。OBS 未实现时抛 NotImplementedError。

### 测试结果

```
8 passed

TestLocalStorage: save/exists/unique_key/extension/get_path/delete/nonexistent/large_content
```

## 改进之处

- storage_key 使用 UUID，避免文件名冲突和遍历攻击。
- 保留原文件扩展名，便于后续 MIME 类型判断。
- 大文件测试（5MB）验证存储能力。

## 存在的问题

- OBSStorage 未实现，待 S7-T01 根据华为云验证结果补充。
- 无文件大小限制检查，待 S4-T01 上传接口中添加。

## 验收标准

- [x] LocalStorage 可上传/下载/删除/检查存在
- [x] storage_key 唯一且保留扩展名
- [x] 8 个测试全部通过
