# Beam 单色与单层效果调整

2026-10-16 · 分支 `design-system`

## 当前规则

- 工作台的待确认预约、进行中订单分别按自身数量启停 Beam；只有加载成功且数量大于 0 才挂载装饰层。0、加载中、请求失败均不挂载，确认后数量归零也会立即移除。
- 浅色模式 Beam 与暗色共用库的 dark 渲染基准、默认透明度、模糊、尺寸与动画。浅色仅在独立装饰层上应用 LIGHT_BEAM_FILTER 染成浅银蓝色。已撤销底边、边缘遮罩、偏移和透明度补偿，保留完整光晕扩散。strength 固定 0.7，mono、挂载随机形态和数量启停规则不变，预览同步。
- Metal 浅色外围光晕改为白色，取消库默认的 multiply 混合及暗色边缘光；金属材质仍随机选择，强度固定，文字保持可读。
- 所有业务 Beam 和独立预览 Beam 固定 `colorVariant="mono"`，并设置 `staticColors`，不做色相轮换；强度固定 0.7。
- 每个 Beam 实例挂载时从 `md / sm / line / pulse-inner / pulse-outside` 独立随机抽取一次。
- 普通输入、请求更新或主题切换不重抽；重新进入页面、刷新或重新挂载才重新抽取。随机允许连续两次相同，不是固定顺序轮播。
- 登录按钮与预约确认按钮均使用单层 Beam，胶囊边界半径 999；一个控件不叠加 Beam 与 Metal。
- Metal 的独立演示和适配器仍保留，但两处指定按钮没有使用它。检查修改前源码时，两处为单层 Metal，未发现 Beam/Metal 相互嵌套；本次已按要求改为单层 Beam。

## 验证

最新呈现对齐：业务与预览构建通过；浏览器在同一组 md/line/sm 实例上切换主题，形态不变、inset 均为 0、mask 均为 none、额外底边均不存在，仅浅色有染色滤镜。见 [当前截图](design-system-screenshots/beam-light-parity.png)。本轮未重跑测试，以下为历史记录。

最新颜色调整：Beam 光晕本身改为浅银蓝色（Metal 保留上一版），业务与预览构建通过；已在浏览器检查并保存截图 [浅银蓝光晕](design-system-screenshots/beam-light-silver-blue.png)。本轮未重跑测试。

浅色可见性二次调整：业务与预览构建通过，浏览器查看非零卡片、确认按钮与普通总订单卡片的区别。见 [调整后截图](design-system-screenshots/beam-light-visible.png)。此次未重跑测试；下述 155/155 记录属于前一版银白光效。

最新条件启停及银白光效回归：**155/155**，业务与预览构建通过，lint 0 错误、2 条原有警告；浏览器已核对浅色 Beam 装饰滤镜、强度 0.7，以及预览内容无滤镜、Metal 白色光晕。条件启停此前覆盖两项非零、仅待确认、确认后仅进行中、全零四种状态，全零时统计区装饰层为 0。见 [最新机器结果](beam-conditional-results.json) 与 [当前浅色截图](design-system-screenshots/beam-conditional-light.png)。以下随机形态记录来自此前检查。

- 全量前端 **148/148 通过**，业务与预览构建通过，lint 0 错误、2 条原有警告。
- 新增测试覆盖五种形态可达、挂载重抽、重渲染稳定、mono 固定，以及登录按钮不包含 Metal。
- 浏览器对工作台进行 12 次挂载，24 个实例：`md` 7 次、`sm` 4 次、`line` 3 次、`pulse-inner` 6 次、`pulse-outside` 4 次，全部 mono。
- 登录输入与主题切换前后形态保持为同一个 `line` 实例；1 个 Beam、0 个 Metal。
- 确认按钮检查到 1 个按钮、1 层装饰、0 个 Metal、0 个 Canvas，避免多层渲染或复制交互节点。

[机器结果](beam-mono-results.json) · [深色截图](design-system-screenshots/beam-mono-dashboard-dark.png) · [浅色截图](design-system-screenshots/beam-mono-dashboard-light.png)

本次是效果策略调整，不代替此前尚未完成的性能、读屏、跨浏览器及完整业务验收。


