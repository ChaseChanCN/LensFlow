# 首页人物粒子融合

2026-10-16 · `design-system`

- 首页画布覆盖整个 `material-home-hero`；肖像按 hero 全高等比放大，桌面面部偏左、窄屏面部居中；窄屏允许裁去原照片两侧背景。文字仍叠放于 hero 上层，桌面偏右、窄屏靠下。
- 遮罩位于 hero 的独立装饰层，`inset:0` 贯穿整个 hero 高度；以 `--mat-page` 为底色，桌面横向渐隐、窄屏纵向渐隐，随主题同步。
- `ParticlePortrait` 复用 `/lensflow-v24.html?portrait=hero` 的原 Three.js 场景与 `data/particles.bin`，不重新采样，也不更改粒子的相位、周期、亮度振幅或 animationSpeed。原呼吸参数保持 minPeriod 1 / maxPeriod 18、亮度 0.82–1.5、animationSpeed 2.7。
- hero 模式隐藏旧文案/按钮和滚动占位，保留人物形态；相机按高度缩放，肖像原图高度等于 hero 高度；字形大小随投影比例缩放。原独立粒子页保持原行为。
- 按最新指示，两种主题都保留白色面部高光、黑色暗部，不反相；浅色只通过正向对比曲线增强层次。hero 使用正常混合；粒子原图四边在 shader 中逐渐羽化，画布外缘轻微淡出，遮罩渐变范围拉宽以减轻矩形边界。主题通过校验同源及父窗口的消息更新 shader 和场景底色，不重载 iframe、不重置呼吸时钟。
- 装饰肖像不进入键盘顺序和读屏内容；系统减少动态效果设置继续由原场景处理。

业务与预览构建通过；本轮未新增或运行自动测试。浏览器查看五种宽度，均无横向溢出且遮罩全高；15 类路由未见 Beam/Metal 混用。效果封装以外层装饰为唯一拥有者，内层不挂载重复效果。见 [记录](home-face-refinement-results.json)。截图为 `design-system-screenshots/home-face-safe-dark.png`、`home-face-safe-light.png` 和 `home-face-safe-mobile-light.png`。

最新截图：design-system-screenshots/home-white-face-fullheight-light.png；375px 下 hero 与肖像画布均为 720px 高，无横向溢出。构建通过，本轮未运行自动测试。

## 白色面部修正

浅色页面中的肖像区域也使用与深色一致的黑底白粒子，避免白色高光消失于浅底、只剩黑色颗粒。浅色页面通过椭圆径向羽化及上下边缘羽化，将肖像黑底融入页面；文案仍使用全高渐隐遮罩。肖像按 hero 高度适配，呼吸参数保持。最新截图：design-system-screenshots/home-white-portrait-dark-field-light.png。构建通过，本轮未运行自动测试。

最新视觉修正：撤销浅色肖像黑底，改为淡银灰底色，以更宽的渐变融入页面；降低暗色字符的覆盖度，让白色面部高光占主导。最新截图：design-system-screenshots/home-portrait-silver-integration.png。构建通过，未运行自动测试。

## 当前实现：浅色改用 reference3_particles（2026-10-17）

此节替代上文浅色模式的历次试验。浅色使用 reference3_particles 原始 RGB 与原呼吸 shader，不进行灰度转换、反相或统一染色。WebGL 使用透明清屏和正常透明混合，HTML 底色透明，撤掉额外黑色/深灰色背景。粒子画布取消边缘 mask。深色仍使用原人物数据与原渲染方式。

22,111 个粒子按完整包围范围等比缩放，预留最大字符半径；桌面放于左侧，窄屏放于文案上方。六种 hero 尺寸逐个投影全部粒子的字形边界，均位于 hero 内，记录见 reference3-containment-results.json。构建通过；本轮未运行自动测试。

### 最新配色调整

按用户最新要求，浅色 reference3_particles 将原 RGB 的亮度映射为黑白灰，保留原呼吸动画和透明背景；不反相，不增加背景，不更改完整缩放范围。此项替代上一节的原青蓝色配色。

### 浅色细节对比与背景同色高光

浅色 reference3 使用原始亮度（不经过原 shader 的高光增亮），以 smoothstep(0.20, 0.98) 和 2.2 次曲线拉开明暗。深色端为黑色墨点，浅色端为透明，因此最终高光精确透出 --mat-page，没有纯白颗粒，也没有额外背景。原呼吸因子继续调制墨点覆盖度，粒子位置与完整缩放保持。

### 面部留白和轮廓（最新）

整图暗部增强会把面部阴影变为密集黑点，因此浅色 reference3 面部改为独立区域处理。根据原图面部边界在原粒子上保留窄轮廓，面部内部透明以显示页面底色，眼睛保留原亮度推导的黑色粒子细节；边界外侧柔和过渡。没有绘制实心脸部或增加背景。呼吸继续作用于轮廓和眼睛覆盖度。构建通过，浏览器查看并保存 home-reference3-face-outline.png。

## 当前版本：reference4_particles（取代上述浅色试验）

浅色从项目根目录 reference4_particles 原样复制标准 particles.bin 和 metadata.json；22,111 个粒子，二进制与元数据哈希一致。未使用 data_fine（43,481 个粒子），未抽样或修改字形索引、draw_size、坐标和动画种子。附带 preview.png 与用户指定 dist/data/preview.png 哈希一致。移除此前面部蒙版、轮廓重画、反相、smoothstep/pow 对比曲线和高光增亮。颜色为原 RGB 亮度的线性灰阶，亮端匹配页面底色；呼吸保留。背景透明，无黑底。

相机使用全部粒子与各自字形半径构成的实际包围范围完整缩放；没有粒子 mask，文案渐变从人物安全区域以外开始。按设备像素比绘制字形，避免高 DPI 下点尺寸相对缩小。六种 hero 尺寸检查全部 22,111 个粒子字形边界均在 hero 内。375px 浏览器查看无横向溢出，深色切换仍使用 original 数据。构建通过。

视觉对照结论：当前浅底透明效果不能等同用户提供的黑底 preview。preview 的黑色负空间贡献了主要对比，浅底透明区域为页面底色；此外 preview 为混合字符/短线的离线栅格渲染，实时引擎为原字形粒子 renderer，并非同一像素级渲染器。保留数据精度不代表缩小后的屏幕有同样像素密度。不声称达到 preview 同等对比或像素一致。没有为补偿差异擅自反相、加背景或重画脸部。

证据：reference4-containment-results.json；design-system-screenshots/home-reference4-light.png、home-reference4-mobile-light.png。

## 最新：浅色独立视觉重建与腿部负空间修正

此前浅色 reference4 线性灰阶、面部蒙版等试验均由独立 light-portrait.html 和离线重建数据替代。以原始 ASCII 源图重采样；根据用户明确反馈保留腰部以下连通背景的负空间，腿部弱纹理不扩展为实心黑块。最终 59,807 个粒子，桌面字符/短线、窄屏显示合并；仅亮度呼吸，位置固定。深色原文件本轮哈希未变化。实施过程、实际页面截图、性能及源图限制见 [浅色重建记录](light-portrait-rebuild/README.md)。

### 新源图补齐腿部与鞋子连接

用户补充完整 ASCII 源图后，生成器改用 scripts/assets/light-portrait-source.png。源图已有连续小腿字符，重建后双腿与鞋子连续且腿间留空，没有推断绘制连接线。新数据 59,021 个粒子；桌面/手机静态截图确认后恢复呼吸。六种视口及 DPR 1/2 边界检查通过，深色文件未改。最新截图为 light-new-source-final-desktop.png 和 light-new-source-final-mobile.png，详见浅色重建记录的最新更新。
