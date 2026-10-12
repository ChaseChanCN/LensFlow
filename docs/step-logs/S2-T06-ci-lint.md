# S2-T06 基础 CI 与代码规范

## 实现目的

配置代码规范工具（ruff/mypy/oxlint）和 pre-commit hooks，创建 Makefile 一键执行 lint + test，确保代码质量可持续。

## 如何实现

### 配置文件

| 文件 | 内容 |
|---|---|
| `backend/pyproject.toml` | ruff（E/F/I/W 规则）+ mypy 配置（S1 已创建） |
| `Makefile` | install/lint/test/build/migrate/dev 一键命令 |
| `.pre-commit-config.yaml` | ruff 自动修复 + pytest + vitest |

### 检查结果

```
ruff check: All checks passed! (15 个问题已自动修复 + 2 个手动修复)
oxlint: 无问题
后端测试: 72 passed
前端测试: 7 passed
tsc --noEmit: 无错误
```

## 改进之处

- ruff 自动修复了 15 个导入排序问题。
- Makefile 提供 `make lint`、`make test`、`make build` 一键操作。
- pre-commit 配置在提交时自动运行 lint + test。

## 存在的问题

- mypy 未实际运行（类型标注不完整，待后续补充）。
- pre-commit 未安装（需 `pip install pre-commit && pre-commit install`）。
- 无 GitHub Actions/CodeArts 流水线配置（待 S8 阶段）。

## 验收标准

- [x] ruff 检查全部通过
- [x] oxlint 检查全部通过
- [x] Makefile 可用
- [x] pre-commit 配置已创建
- [x] 全部测试通过
