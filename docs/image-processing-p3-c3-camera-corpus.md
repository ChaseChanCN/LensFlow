# P3-C3 元数据语料来源与相机兼容性证据

## 结论

本轮没有取得足以证明来源的 Canon、Nikon 或 Sony 相机原始 JPEG。三个厂商的真实原片兼容性验收均为**未完成**。仓库现有真实照片可以验证 JPEG 结构、只读读取、无 EXIF 的缺失值策略和衍生构造数据；它不能证明厂商 MakerNote、真实镜头命名、厂商 ICC 或编辑软件重写行为的兼容性。

未下载外部个人照片，未读取用户上传目录以收集语料，也未用构造的 `Make`/`Model` 标签冒充相机原片。

机器可读清单位于 [metadata-manifest.json](../backend/tests/fixtures/metadata-manifest.json)。P3-C3 定向回归位于 [test_metadata_compatibility.py](../backend/tests/test_metadata_compatibility.py)。

## 1. 本次检查的来源

| 文件/生成器 | 分类 | 独立检查与限制 |
|---|---|---|
| `backend/tests/fixtures/grace_hopper.jpg` | 真实摄影图像，相机来源未确认 | Pillow 独立读取为 517×606 JPEG，73746 字节，无 EXIF、无 ICC；SHA-256 与既有 README 一致。不能推断相机和镜头。 |
| `docs/image-processing-p3-c1/constructed-metadata.jpg` | 构造元数据注入 | 以原照为底图插入 APP 段。Pillow 读到 `Canon` / `Canon constructed sample` / `Constructed 50mm`，属于测试期望值。 |
| `docs/image-processing-p3-c2/known-exif-sample.jpg` | 构造元数据注入 | Pillow 读到 `Canon` / `EOS 70D` / `Constructed 35mm`。真实机型名称不是来源证明；仍不计入 Canon 原片。 |
| `backend/tests/metadata_samples.py` | 运行时构造测试家族 | Canon/Nikon/SONY 名称、大小端 TIFF、日期、GPS、序列号、光学参数均为注入内容。 |
| Pillow / LCMS 生成的 sRGB ICC | 图像库生成的配置文件 | 验证 APP2 分片组装和配置文件指纹，不是相机固件输出的 ICC。 |

原照的既有来源声明为 James S. Davis / United States Navy 的 Grace M. Hopper 官方肖像，1984-01-20，美国联邦作品公版；来源页面与下载地址记录在 [fixture README](../backend/tests/fixtures/README.md)。本轮使用本地文件和既有来源记录，没有重新联网核实页面、授权或相机来源。

清单保存三个文件的完整 SHA-256、字节数、尺寸、Pillow 独立预期和前序文档位置。它不保存 GPS、设备序列号、原始 XMP 或用户数据。测试读取并校验清单，防止文件内容和来源分类悄然漂移。

## 2. 原有与新增回归的边界

原有 [test_photo_metadata.py](../backend/tests/test_photo_metadata.py) 已覆盖 C1 的 50 项提取、安全和权限检查，包括构造厂商标签、未知镜头、部分日期与时区错误、基础 XML 安全、APP 预算及单段 ICC。新增文件集中补充以下边界：

| 新增检查 | 验证方式 | 不作出的推论 |
|---|---|---|
| 全部 8 个 EXIF Orientation | Pillow `ImageOps.exif_transpose` 独立核对显示尺寸；原始宽高与源字节 SHA 保持不变 | 不声称 C1 执行了像素旋转；C1 仍只读元数据 |
| 多段 ICC | 三个分片按不同 APP 顺序输入，与 Pillow 组装结果及独立 SHA 比较 | 不等同于真实厂商 ICC 语料验证 |
| 错误 ICC 分片 | 重复编号、总数不一致、零编号、越界编号、缺片；只返回固定警告，不发明配置文件 | 不假设损坏 profile 可恢复 |
| Legacy IPTC | 未标编码的 Latin-1 重音字符保留且明确报告 fallback；UTF-8 声明下损坏字段跳过 | 不猜测 GBK、Shift-JIS 或其他未知代码页 |
| 多个 APP13 / IIM 扩展长度 | 跨段标题、作者、关键词与显式两字节扩展长度；确定去重顺序 | 不声称支持全部 Photoshop resource / IPTC 规范 |
| XMP namespace | 错误 URI 的 `dc` 前缀被忽略，正确 URI 换前缀仍可读 | 不依赖前缀名称识别可信字段 |
| 重复 XMP 包 | 保留第一个标准包，发出重复警告 | 不合并相互冲突的包或 Extended XMP |
| DTD / XXE | 无实体 DOCTYPE、参数实体、UTF-16BE 外部实体；固定安全警告，监测文件与网络入口未调用 | 不是完整 fuzzing 或外部渗透测试 |
| 拍摄地日期与子秒 | 闰日、±14:00、零偏移和无偏移；9 位子秒保留，不做 UTC 日期替换 | 不猜测无时区照片的 UTC 时间 |
| 未知镜头 | 仅有相机信息时镜头保持 null，provenance 无镜头来源 | 不根据相机或文件名猜镜头 |
| 只读、源身份、无串扰 | 混合 APP 包的重复真实 Storage 读取，核对 SHA、字节和 mtime；插入另一次解析后结果仍一致 | 不把无缓存重复读取称作持久索引一致性测试 |

新增测试均使用真实摄影底图的构造 APP 数据，不修改生产解析器、现有图片算法、索引模型或 API 合同。

## 3. 后续引入有授权真实相机语料的流程

### 3.1 取得与记录授权

1. 优先请项目成员提供自有、可用于自动化测试的原始 JPEG，或取得摄影师明确授权。保留文件原件，不经社交平台或图片编辑器另存。
2. 明确授权是否允许提交到仓库及 CI 分发。只允许本地使用的私有照片不得加入公开 Git 仓库；可由 CI 私有只读素材挂载提供，并在清单中标记不分发。
3. 来源记录应包括提供方式、授权记录引用、厂商/机型/固件的提供者说明、文件是否经过编辑器，以及允许的保留范围。禁止仅凭 EXIF 标签确认相机身份。
4. 使用没有敏感主体、地点与私有标签的测试拍摄。发现 GPS/序列号时先取得存储许可或选择另一份样本；移除元数据后应重新分类为派生文件，不能再称为未改动原片。

### 3.2 独立建立期望值

1. 导入前记录原件 SHA-256、字节数和尺寸，设只读；所有处理对副本进行。
2. 使用独立工具读取允许核对的 EXIF/IPTC/XMP/ICC 字段，例如已获准环境中的 ExifTool 或 Pillow。独立工具输出属于受控临时证据，不把含 GPS、序列号或路径的完整 dump 提交到仓库。
3. 白名单期望值至少覆盖厂商/机型/镜头（可缺失）、ISO、焦距、光圈、曝光、方向、DateTimeOriginal、OffsetTimeOriginal、SubSecTimeOriginal、描述来源和 ICC 指纹。保留“未知”和冲突，不补全猜测值。
4. 对日期同时记录原始 wall clock 与是否存在显式时区。对 ICC 记录分片情况与完整 profile 指纹；对 IPTC 记录是否存在编码声明。
5. 将来源、许可、SHA 和白名单期望加入清单；真实来源验证与 parser 成功必须分别记录。扩展清单测试时允许有证据的相机原片分类，不能只修改覆盖计数。

### 3.3 建议的最小样本矩阵

| 来源 | 建议覆盖 |
|---|---|
| Canon 原始 JPEG | 带/不带 LensModel；至少一份显式时区、一份旧固件无时区 |
| Nikon 原始 JPEG | 不同镜头字段组合、方向 1/6；保留有授权的复杂 APP 布局 |
| Sony 原始 JPEG | 镜头识别缺失或第三方镜头、日期与子秒、固件输出 ICC（若有） |
| 授权编辑器导出 JPEG | 单独分类，验证 legacy IPTC、多个 APP13、XMP namespace 与 ICC multipart；不计作相机原片 |
| 畸形构造语料 | 独立于真实样本，覆盖指针、编码、DTD、分片、边界及预算；继续离线运行 |

获得文件后，先运行 C1/C2/C3 定向回归，再在隔离 API 环境验证权限、索引白名单、原件哈希与数据库状态。失败样本不得通过改标签、删暗部或替换静态期望伪装通过；若修复 parser，只改已证实缺陷并添加最小回归。

## 4. 执行与验收

实际命令和结果由 P3-C3 主报告统一汇总；本轮使用项目既有 Python 环境和 fail-closed pytest fixture。pytest 在导入 app 前切换到独立临时 SQLite 与 uploads，屏蔽通知，并在测试后比对真实开发存储指纹及清理临时目录。

这部分工作的交付状态：**语料分类与合成回归已实现；真实 Canon/Nikon/Sony 相机原片验收未完成**。这不是 PostgreSQL、跨进程索引或浏览器恢复验证的替代证据，后者由 P3-C3 的其他独立检查记录。
