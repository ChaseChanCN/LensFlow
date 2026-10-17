# 浅色 Hero 人物粒子重建 · 2026-10-17

## 最新更新：使用用户补充的完整腿部源图

本节取代下文旧源图关于腿部缺失的结论；下文静态轮次保留为历史记录。

- 新输入：用户补充的 `codex-clipboard-1e8108ca-9a32-4901-8b3b-cf7e0188b21f.png`，1333×1180，已原样保存于 `scripts/assets/light-portrait-source.png`。
- 新图包含连续小腿与鞋子，直接从其字符结构重建，没有补画连接线。旧图在这段缺失的判断不再适用于新输入。
- 保留两腿之间的负空间；降低下半部前景支持阈值以保留真实弱字符，并提高弱证据的采样保留率，避免再次截断小腿。
- 局部密度区域随源图尺寸等比换算，未改变人物姿态或比例。
- 最终为 59,021 个粒子。以实际 Hero 静态查看桌面和手机，确认腿与鞋连续后恢复轻微呼吸。
- 实际截图：`../design-system-screenshots/light-new-source-static-desktop.png`、`light-new-source-static-mobile.png`、`light-new-source-final-desktop.png`、`light-new-source-final-mobile.png`。
- 六种宽度、DPR 1/2 包围检查均通过；左右小腿到鞋子所在区间的每个 15px 源图行带均有生成粒子，结合截图确认不再断开。
- 深色渲染文件哈希仍与本轮重建前一致。控制台无 error，构建通过。90 帧窗口仍为 1 draw call，CPU 中位数约 0.1ms、P95 0.2ms。
- 新图仍是 ASCII 图而非摄影原片，没有进一步恢复或补画其未包含的眼部细节。

## 范围与输入（此前轮次）

仅替换浅色 Hero 人物。深色仍使用 `/lensflow-v24.html?portrait=hero`。
本轮开始与结束的深色渲染文件 SHA-256 一致，见 `verification.json`。
未修改深色数据、样式、着色器或相机逻辑。

核查 `reference4_particles`、`reference3_particles` 和桌面原粒子项目后：

- 有用户提供的 `reference3.png`、标准/细粒子数据、preview 及离线生成代码。
- `reference2.png` 是同一 ASCII 人物的另一配色，不是摄影原片。
- 没有这位人物的原始照片、透明人物图或真实 Alpha Mask。
- 原项目 `pipeline/preview_renderer.py` 使用灰阶字符和短横线在黑底离线绘制；原实时 shader 另有高光增亮和加法混合，不能直接当作浅底显示。

## 重建流程

运行 `python scripts/build_light_portrait.py`，需要 Pillow 与 numpy。

1. 从原 ASCII 图提取连续字符支持范围，推导前景初始包围区域。
2. 根据用户明确指出的腿部负空间，沿腰部以下与外界连通的空白恢复透明区。没有将所有黑色像素一律删除，也没有将所有内部黑色一律补成人物。
3. 腿部稀疏、低亮度字符仅作为弱前景证据，不扩张成黑色块；保留原有边缘和灰阶纹理。
4. 从原 RGB 亮度恢复局部灰阶；小范围字形闭合减少 ASCII 微间隙对亮度的干扰。使用炭黑覆盖度表现浅底层次。
5. 面部、手部、手臂区域提高采样密度、减小字形。区域仅改变采样，不绘制五官或改变结构。
6. 输出独立二进制：59,807 个粒子、位置/墨色覆盖度/尺寸/字形/相位/周期/稳定权重。生成过程不依赖此前 22,111 粒子数据。

`inferred-foreground.png` 和 `recovered-source-tone.png` 为离线诊断证据，**不在页面显示**。

## 独立实时渲染

`frontend/public/light-portrait.html` 使用 Three.js Points、ShaderMaterial、正常 Alpha 混合和透明清屏。
实时页面只加载生成的数据和元数据，通过代码生成字符/短线图集；没有叠加静态人物照片。

- 桌面保留字符和短线纹理；亚像素尺寸下合并邻近墨色为墨点/短线，避免重复摩尔纹。
- 小屏合并只影响显示层级，离线数据仍保留。前景负空间不做连片填充。
- 人物完整包围范围适配 Hero；布局断点来自父页面，避免平板 iframe 宽度与页面断点不一致。
- 呼吸只调制覆盖度，周期 5–14 秒、幅度约 0.6%–3.8%；高梯度结构更稳定，位置不动。
- 页面隐藏或人物离开可见区域时停止 RAF；遵循减少动态效果设置；卸载释放 GPU 资源。
- `?motion=off&layout=side` / `?motion=off&layout=stacked` 可用于静态渲染核查。

## 静态轮次与视觉判断

所有下列截图均来自 LensFlow 实际 Hero，而非独立黑底画布。

| 轮次 | 实际页面截图 | 判断 |
|---|---|---|
| 1 | `../design-system-screenshots/light-rebuild-static-01.png` | 未通过：RGB 最大通道误把青蓝头发当亮区；细碎噪声多 |
| 2 | `../design-system-screenshots/light-rebuild-static-02.png` | 明暗结构恢复，局部字形仍粗 |
| 3 | `../design-system-screenshots/light-rebuild-static-03.png` | 局部细节改善；随后用户指出腿部负空间被错误填黑，此版不作为验收结果 |
| 4 | `../design-system-screenshots/light-rebuild-static-04.png` | 未通过：全局纹理缩小过滤使桌面字形模糊 |
| 5 | `../design-system-screenshots/light-rebuild-static-05.png` | 桌面字形恢复，但腿部拓扑仍待修正 |
| 负空间修正 | `../design-system-screenshots/light-rebuild-static-negative-space.png` | 腿间连通背景恢复；随后进一步降低腿部弱字符的覆盖密度 |
| 最终 | `../design-system-screenshots/light-rebuild-final-desktop.png`、`light-rebuild-final-mobile.png` | 作为当前实际结果；已恢复轻微呼吸 |

当前视觉判断：人物轮廓、抬手姿态、头发、手臂及衣物有明确结构；中央腿间为空白；未使用黑色背景板。窄屏用显示层级消除原先明显的重复摩尔纹，不能在小尺寸下逐字阅读桌面的字符纹理。

## 验证与性能

- 320 / 375 / 768 / 1024 / 1440 / 1920 六种视口宽度查看布局，无横向溢出。
- 对这些实际 Hero 尺寸，以 DPR 1/2 投影检查全部原粒子及显示合并后的点，含字形尺寸与固定微偏移，边界均在 Hero 内。
- 用户指出的腿间原图空白矩形 `[580,900,630,1060]` 内生成粒子数为 0。
- 浏览器当前页无 error 级日志；构建通过。
- 本机 90 帧窗口：1 次 draw call、59,807 个点，CPU 提交中位数约 0.1ms / P95 0.2ms，帧间隔中位数约 16.7ms。该结果不是 GPU 耗时，也不是跨设备保证。
- 新数据原始大小 1,913,824 字节，gzip 计算大小 1,086,056 字节；是否实际压缩取决于部署服务器。

详见 `browser-responsive.json`、`verification.json`、`performance.json`。未新增或运行业务自动测试。

## 尚未解决的输入限制

原 ASCII 图已丢失部分眼部和面部细节，不能据此恢复摄影原片级五官，也没有补画这些信息。
前景遮罩为推导结果，并非真实 Alpha；腿部的歧义按用户明确反馈修正。若要进一步确定所有衣物阴影与背景交界，仍需同一人物的原始照片或可靠的前景 Alpha。
因此不宣称与黑底 preview 逐像素相同，也不宣称照片级身份细节已经全部恢复。
