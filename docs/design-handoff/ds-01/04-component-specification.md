# 04 · 组件与交互模式规格

20类交接对象中，19类有当前活动实现／组合模式；C09 Tabs 是明确缺口，不虚构组件。下面提到的源码均以仓库根目录为基准。组件事实为 VERIFIED_SOURCE；指定截图额外标 VERIFIED_RENDER；所有“小程序”建议为 PROPOSED_ADAPTATION。通用组件API不是最终CSS：必须叠加Material覆写。

## 公共表面与测量规则

业务默认：浅色 page `#f5f4f0`／panel `#fffefa`／主文 `#202b3b`／次文 `#596577`；深色 page `#101217`／panel `#171a21`／主文 `#f0f1f3`／次文 `#a0a8b7`。边界分别 `#c5ccd4`／`#343c49`，分隔线 `#d8dcdf`／`#2b303a`。照片画布两主题都为 `#323232`。这些是Material或局部最终值，不是为小程序新增配色。

组件正文基础14px，字重400/500，标题主要20px/600；Material页面主标题另有44px/500覆盖。字号未明确声明行高时继承实际样式，不能编造统一高度。基础12px卡片圆角常被Material16px覆盖；照片／品牌区例外单列。Web控件在当前Material下最小44px高，但这条选择器仅覆盖带 `data-ui-button` 的Button；其他原生button不自动满足44px热区。

小程序建议主操作48px高、文字16px、圆角胶囊，独立交互热区至少44×44逻辑px；主正文16px、辅助14px、非关键说明12px。它们都在JSON的 `mobileProposals`，不替换Web证据。

## C01 · 主要按钮 filled

- 来源：`frontend/src/components/ui/Button.tsx:19-70`；`frontend/src/components/material/site.css:14-16`；登录例外`material.css:150-151`。VERIFIED_SOURCE；工作台样式数值另为VERIFIED_RENDER。
- 结构：原生button→居中的inline-flex文字／左右图标→绝对定位Spinner。sm/md/lg的横内边12/16/20px、纵内边6/10/12px；sm/md文字为Tailwind `text-sm`，lg为`text-base`。最终胶囊999px、min-height44px；登录主按钮52px。普通filled底色取mat-control，文字mat-button-text，1px边取mat-button-border，不是#007AFF实底。
- 交互：默认、hover底色mat-button-hover、active:scale(.97)、focus-visible 2px轮廓且外偏2px；disabled opacity .4、不可指针操作；loading隐藏原文字但保留占位、Spinner居中、禁用重复提交并aria-busy。无通用selected、error、success变体。
- 小程序：单页只突出当前主要任务；按下反馈可以轻微明暗或短过渡；不复制Beam／Metal。反例：把加载文字直接删除导致按钮跳宽；每个卡片都放实心大蓝按钮。

## C02 · 次要按钮 tinted／gray／plain

- 来源同C01，`Button.tsx:22-27`及`site.css:17`。VERIFIED_SOURCE。
- 结构／排版／尺寸与C01共享；tinted为info-bg/info-label，gray为system-fill/label，plain透明背景、action-primary-strong文字；Material保留胶囊与44px最小高度。图文间gap8px。
- 状态：gray hover和active分别更换fill层级；tinted/plain在hover/active改变文字；共用focus、disabled、loading。它们不是可切换的selected Tabs。
- 小程序：返回／查看详情／重试作为次动作，不与提交竞争；plain仍需44px热区。反例：用低对比细字承担唯一确认动作；把所有次动作做图标无文案。

## C03 · 危险操作 destructive

- 来源：`Button.tsx:28-29,55-65`；`pages/client/ClientPage.tsx:84-99`取消预约；`pages/photographer/UploadPage.tsx:146-148`删除。VERIFIED_SOURCE。
- 结构与尺寸同C01；底色error-label、文字label-inverse，hover/active按95%/90%透明度；胶囊与44px下限来自Material。语义错误色配对随主题变化。
- 状态：默认、hover、pressed、focus、disabled、loading已实现；没有组件内部确认弹窗或成功展示。当前取消示例直接触发mutation，不能声称Web已有二次确认。
- 小程序：对不可逆动作采用适当确认，保持对象名称和取消出口；这是适配提案。反例：用“确定”掩盖取消／删除含义，或为了复刻Web省略必要确认。

## C04 · 图标按钮

- 来源：`material/ThemeToggle.tsx:5-7`、`material.css:3,8`；`ui/Modal.tsx:44-46`关闭；`Toast.tsx:45-46`通知关闭。VERIFIED_SOURCE。
- 主题按钮为44px圆形、1px边；480px以下变40px；内SVG20×20，24单位画布、1.5线宽。Modal关闭为20px图标＋8px padding，Toast关闭16px图标＋4px padding；两者没有统一44px最小热区。当前图标线宽也有2、1.75的用途区别。
- 状态：主题切换按钮动态可访问名称；focus轮廓来自作用域；没有专门通用loading／disabled／pressed图标组件。关闭动作不等于selected状态。
- 小程序：所有图标独立44×44px热区，20px左右可见尺寸；给“关闭预览”“返回订单”等完整名称。反例：照抄24px通知关闭热区，或混入无关风格彩色实心图标。

## C05 · 文本输入 Input

- 来源：`ui/Input.tsx:6-35`（完整前缀`frontend/src/components/`）；`material/site.css:18-20`；登录`material.css:145-149`。VERIFIED_SOURCE；登录／预约画面VERIFIED_RENDER。
- 结构：外层纵gap6px，可见label14px/500→input→错误p12px；default为10px圆角、1px分隔边、横padding14px/纵10px；grouped无自身边框、背景、padding，由组容器分隔。Material统一输入文字14px；登录内原有13px声明被`site.css`后层规则覆盖。登录容器12px圆角且内分组16×18px。
- 状态：placeholder、focus-visible 2px与外偏2px、disabled .5、error边界与轮廓、aria-invalid／describedby／alert。没有统一“验证通过”绿勾或请求中Spinner状态。
- 小程序：持久标签与占位分开；数字／日期选择用适当原生输入；独立输入行建议48px起。反例：只用placeholder当标签、输入错误只Toast、键盘盖住当前字段或提交。

## C06 · 多行输入 Textarea

- 来源：`ui/Input.tsx:50-59`；预约`pages/client/BookingPage.tsx:128-135`；描述字段另在`photo-library/DescriptiveMetadata.tsx`。VERIFIED_SOURCE。
- 与Input相同标签、边框、字体、间距、10px圆角及error关联；预约rows=3，不存在统一固定像素高度。图片元数据多行输入有独立样式和字数规则，不能作为客户备注通用契约。
- 状态同Input；error/disabled/focus已实现；没有通用hover、selected、success或loading样式。
- 小程序：备注自适应高度或明确3行起，余量由字缩放验证；多行时保留label和错误。反例：把摄影师版权／关键词管理表单复制到客户预约。

## C07 · Select 选择控件

- 来源：`ui/Input.tsx:38-47`；预约`BookingPage.tsx:69-80`；图库`photo-library.css:3,21,31`的原生select。VERIFIED_SOURCE。
- 通用Select与Input共用14px文字、default/grouped、label/error/disabled关联；浏览器负责下拉弹层，没有自定义React菜单高度／动画。图库select另有5/6/8px圆角、4/7/8px内边，属于桌面密度。
- 状态：focus、disabled、error；原生选择值存在，但未实现一套自定义hover/pressed菜单组件。加载数据时由页面控制，非Select内建loading。
- 小程序：用原生picker等合适选项列表，展示已选值与取消；不是转写HTML select。反例：复制桌面74px最大宽度的评分下拉或强制所有选项可售。

## C08 · 状态徽标 Badge／StatusBadge

- 来源：`ui/Badge.tsx:11-60`；`material/material.css:14-17,55-58`。VERIFIED_SOURCE；演示徽标VERIFIED_RENDER。
- 结构：静态span，pill圆角，横padding10px、纵2px，文字12px/500；neutral、accent、success、warning、error。颜色为对应的bg/label主题配对，未绘制边框；有border token不等于Badge画了border。
- 状态：以tone表达信息、成功、警告、错误；非交互元素，没有hover、pressed、focus、disabled、loading。订单状态经通用映射后可能变成泛词，不能忽略其副标题的真实业务状态。
- 小程序：完整中文状态＋颜色，一枚主状态足够；状态由服务端输入。反例：只用彩色点，或用“已确认”掩盖“待选片”。

## C09 · Tabs（Web统一组件缺口）

- 活动源码检查：未发现统一 `role=tablist/role=tab` 或共享Tabs实现；`Layout`是链接导航，图库过滤器是select／checkbox，均不能改称Tabs。证据UNRESOLVED（统一实现缺失）。
- Web结构、字号、尺寸、圆角、各状态均无可提取的一套精确值；不生成假“Web Tabs token”。
- 小程序首页／订单／我的使用原生TabBar；页面内订单筛选如果确有需要，可采用有中文标签、明确选中标记的轻量切换。PROPOSED_ADAPTATION：文字14px、热区44px起、强调色取主题accent；不能把此建议算作Web已实现。
- 反例：复制桌面nav胶囊整行当三Tab底栏；在无数据证明时为订单添加十几个状态Tab。

## C10 · 导航与页标题

- 来源：`Layout.tsx:24-76`；`material/PublicShell.tsx:7-13`；`ui/LargeTitle.tsx:9-18`；`material.css:64-80,158-159`；`site.css:2-4,58-59`。VERIFIED_SOURCE；双主题画面VERIFIED_RENDER。
- 公共品牌导航最小92px/窄屏78px；工作区88px/窄屏74px；背景mat-nav半透明并blur18px；品牌20px、工作区caption9px等宽。业务主标题44px/500/1.25/-1.8px，720px以下35px，副文13px/1.8。普通标题区50px上、32px下，窄屏32/26px。
- aria-current表示当前链接；hover、active缩放、focus已有；无统一路由加载条／页面转场组件。品牌header图标也不是小程序胶囊区域。
- 小程序：原生导航和页面栈，页内28px标题可选；二级页显式返回，Tab页切换保持上下文。反例：保留88px网页导航再叠加微信导航栏。

## C11 · 订单列表卡片／分组行

- 来源：`pages/photographer/OrdersPage.tsx:44-57`、`pages/client/ClientPage.tsx:108-125`；`ui/ListGroup.tsx:9-21`、`ListItem.tsx:31-56`；`site.css:5-13,70`。VERIFIED_SOURCE；客户分组画面VERIFIED_RENDER。
- 结构：组标题→有边框面板→leading状态＋中部标题／副标题＋尾部日期／动作。标题14px/500，副文14px；Material组标题11px等宽、字距1px。面板16px圆角、无普通投影；匹配div行最小76px、20×24px内边距，窄屏匹配行18px。可点击ListItem实际是button，保留其自身px16/py12，不能误套div选择器数值。
- 可点击行有hover／active背景、focus、disabled；状态和请求加载／错误／空态由页面组合；没有统一“订单卡片内部请求”组件。
- 小程序：订单身份→真实状态→时间／内容→下一步。单个最重要动作独立，列表点按进入详情。反例：照搬摄影师管理动作、把多个小链接塞在最右侧。

## C12 · 照片卡片与客户选中卡片

- 来源：`photo-library/AssetGrid.tsx:69-77`、`photo-library.css:7-14,20-26`；客户`SelectionPage.tsx:89-110`。VERIFIED_SOURCE；两种画面分别VERIFIED_RENDER。
- 摄影师：照片容器＋checkbox＋编号查看按钮＋评分等工具；边2px透明占位、选中变action-primary-strong，5px圆角；图片contain，标题12px，最终查看行28px、选择行24px。客户：当前仅编号卡片＋已选Badge，padding16px、基础rounded-card，选中info-bg＋2px ring；没有图片。
- 摄影师有selected、focused、缩略图loading/error/retry；客户有aria-pressed、active:scale(.95)、focus、disabled .5、已选Badge；两者都不提供统一success状态。
- 小程序：完整缩略图＋独立勾选44px热区＋稳定编号；卡片点击预览、勾选点击切换的语义需分开。反例：无照片编号卡作为最终选片；触摸整图误提交；给原片添加滤镜。

## C13 · 照片网格

- 来源：`AssetGrid.tsx:12-21,48-82`、`photo-library.css:5-6`；客户`SelectionPage.tsx:89`。VERIFIED_SOURCE。
- 摄影师目标列宽compact128／normal192／large256px，12px gap；列数随实际宽度计算；行高按0.75图像区＋详情区估算，但照片本身contain，不能把0.75误当强裁切比。滚动区68vh、min320/max800px、边1px、圆角8px；虚拟overscan2。客户编号网格2列、md3列、gap12px、横留白16px。
- 网格有已加载计数、下一页加载／失败重试、选择与键盘焦点；全选仅已加载。没有可靠源码支持“总照片数始终等于已加载数”。
- 小程序：默认两列、窄屏／大字可一列；8px gap提案；分页、懒加载、返回保持滚动与选中。反例：强装桌面虚拟器、一次解码所有原图、整页和内部双重滚动互相抢手势。

## C14 · 图片预览覆盖层

- 来源：`PhotoViewer.tsx:9-36`；`photo-library.css:16-19`；`ui/Modal.tsx`。VERIFIED_SOURCE；查看器VERIFIED_RENDER。
- 结构：Modal标题文件名→工具→Canvas预览→尺寸／文件大小／时间→可展开拍摄信息与描述编辑→上一张／下一张／编辑。预览区55vh、min220px、#323232；Canvas按比例适应，无滤镜／投影；元信息13px、gap6×16px。大Modal最大宽768px、圆角16px。
- 读图loading/error/retry；首尾按钮disabled；丢失照片有alert；脏描述切换有确认。无“客户双指缩放组件”可直接提取。
- 小程序：独立大图页或可核验选择状态的原生预览；保留关闭／返回、索引x/y与选择动作，摄影师元数据编辑不出现。反例：拿预览画布当原始交付质量证明，强塞桌面LightTable双图。

## C15 · 对话框与确认

- 来源：`ui/Modal.tsx:21-52`、`ui/modalManager.ts`；`material/site.css:22-24`。VERIFIED_SOURCE；Viewer模态层VERIFIED_RENDER。
- Web为fixed全屏遮罩，Material实际遮罩rgb(10 15 23/.65)＋blur8px；panel圆角16px、surface-primary、modal shadow，四周16px、最大高度calc(100dvh - 2rem)；标题20px/600，头／体／尾padding16px，尾动作gap12px。lg768px，其余sm/md为Tailwind宽度类，本包不凭名称猜固定值。
- role dialog/alertdialog、aria-modal，栈管理、Escape、背景点击（可关闭）、滚动锁、初始焦点／恢复焦点由manager处理。loading/disabled/error/success由内容／按钮提供，容器没有独立这些变体。
- 小程序：简单确认使用适当原生dialog，复杂选择可底部sheet；保留任务标题、取消和可返回性。反例：为了像Web在每个小程序弹层套blur、把系统授权提示仿制成品牌弹框。

## C16 · 加载状态

- 来源：`ui/Spinner.tsx:10-18`、`PageState.tsx:4-5`；分析专用`effects/EffectSurfaces.tsx`；骨架`material.css:109-110`。VERIFIED_SOURCE。
- Spinner16/24/32px，环线宽3、底环opacity .25，CSS spin；LoadingState居中padding24px，带可理解label。统计未就绪显示“—”，骨架只在分析等特定组件存在，不是全站通用骨架系统。
- role=status、aria-label；按钮内Spinner为装饰，外按钮aria-busy。减少动态效果停止旋转。没有可编造的固定进度百分比。
- 小程序：保留目标区域占位、说明加载对象；只有真实耗时任务才更细反馈。反例：全屏反复闪白、转圈遮住已加载图片、普通请求复制Orb依赖。

## C17 · 空状态

- 来源：`ui/EmptyState.tsx:11-20`；订单／客户／交付页调用点。VERIFIED_SOURCE；交付空态VERIFIED_RENDER。
- section→48px图标容器（12px基础圆角、fill-tertiary）→20px/600标题→14px次文→可选Button；gap12px、横padding24px、纵48px。图标为24单位线性文件夹，非客户图片占位。
- title关联语义，有可选下一动作；无独立hover/pressed/loading/selected变体，按钮状态按C01。空列表与筛选无结果文案不同。
- 小程序：保留原因与下一步；“摄影师尚未发布”“没有符合条件的照片”“暂无订单”分别表达。反例：网络失败显示暂无照片，或用大型插画替代可执行动作。

## C18 · 错误与冲突状态

- 来源：`ui/PageState.tsx:8-9`；表单Input；`SelectionPage.tsx:80-83`重载；`photo-editor/DraftStatus.tsx:4-13`与图库批处理反馈。VERIFIED_SOURCE。
- ErrorState为error-bg容器＋EmptyState标题/说明＋可选重试；错误文案与error-label，外边16px，圆角基础12px（具体上下文再看Material规则）。表单错误就地12px；草稿冲突是文本状态＋独立解决动作，没有通用“冲突弹窗主题”。
- role=alert，重试、版本冲突、原图冲突可见；当前选片重载仅在refetch成功后清本地编辑（并发工作区更新后已复读确认）。错误不自动伪造成功；按钮loading由调用方承担。
- 小程序：保留已选／表单内容、对失败项重试；冲突先核对当前服务端版本。反例：一律清空重来、只靠一闪而过Toast、回退操作无说明。

## C19 · Toast 与通知

- 来源：`ui/Toast.tsx:8-65`；`index.css:214-240`。VERIFIED_SOURCE；本次没有捕获独立Toast运行截图。
- 结构：20px状态SVG＋14px文字＋关闭；padding16px、gap12px、基础卡片圆角、语义边框／底色／文字和elevated shadow。viewport横留白16px、max-w-sm、top16或bottom16px，z-toast2400；Portal同步主题，可挂到活动Modal内。
- 四tone，默认3000ms；hover／focus暂停，duration0不自动消失；error为alert/assertive，其余status/polite。进入200ms ease-out、上下8px位移。无通用selected或请求loading通知变体。
- 小程序：轻量成功可短提示；校验／权限／过期错误留在页面。反例：把Web3000ms强设成每一种原生Toast时长，或重复播报同一错误三次。

## C20 · 进度与处理指示

- 来源：`photo-library/MetadataTools.tsx:33-59,68-80`、`useAnnotations.ts`、`pages/photographer/PhotoLibraryPage.tsx`的status；`photo-editor/DraftStatus.tsx:4-13`。VERIFIED_SOURCE。
- 当前主要是“已处理n／total”、忙碌文字、Spinner和状态说明；没有统一共享的百分比进度条／progressbar组件、固定条高或统一颜色。参数range是图像调整输入，不是上传进度条。
- 已实现忙碌、成功／失败／部分失败、停止续批／重试等场景级反馈；loading不等于已知百分比，selected不适用。字为12/13/14px取具体上下文，不发明统一精确值。
- 小程序：有服务端真实计数才显示n/N；失败保留已完成项，停止与重试解释作用。反例：定时器假跑至99%、客户选片引入摄影师索引管理UI。

## 全状态证据矩阵

S=VERIFIED_SOURCE中有明确实现；S*=由组合的子控件／页面提供；—=无专门实现或不适用。任何由—补充的移动交互均是PROPOSED_ADAPTATION。这里不把操作系统默认行为当自定义Web状态样式。

| 对象 | Default | Hover | Pressed | Focus | Disabled | Loading | Selected | Error | Success |
|---|---|---|---|---|---|---|---|---|---|
| C01 主按钮 | S | S | S | S | S | S | — | — | — |
| C02 次按钮 | S | S | S | S | S | S | — | — | — |
| C03 危险按钮 | S | S | S | S | S | S | — | — | — |
| C04 图标按钮 | S | — | — | S | — | — | — | — | — |
| C05 Input | S | — | — | S | S | — | — | S | — |
| C06 Textarea | S | — | — | S | S | — | — | S | — |
| C07 Select | S | — | — | S | S | — | S*原生值 | S | — |
| C08 Badge | S | — | — | — | — | — | — | S | S |
| C09 Tabs缺口 | — | — | — | — | — | — | — | — | — |
| C10 导航 | S | S | S | S | — | — | S | — | — |
| C11 订单分组 | S | S*行 | S*行 | S*行 | S*行 | S*页 | — | S*页 | S*Badge |
| C12 照片／选片卡 | S | S*客户 | S*客户 | S | S*客户 | S*缩略图 | S | S*缩略图 | — |
| C13 网格 | S | — | — | S | — | S | S*卡 | S | — |
| C14 预览 | S | S*Button | S*Button | S*Modal | S*导航 | S | — | S | — |
| C15 Modal | S | — | — | S | S*Button | S*内容 | — | S*内容 | S*内容 |
| C16 Loading | S | — | — | — | — | S | — | — | — |
| C17 Empty | S | S*Button | S*Button | S*Button | — | — | — | — | — |
| C18 Error | S | S*Button | S*Button | S*Button | S*动作 | S*重试 | — | S | — |
| C19 Toast | S | S*计时 | — | S*计时／关闭 | — | — | — | S | S |
| C20 进度文本 | S | — | — | S*动作 | S*动作 | S | — | S | S |

相关：[令牌](03-token-reference.md) · [页面指导](05-mobile-screen-guidelines.md) · [漂移](08-design-drift.md) · [入口](README.md)。
