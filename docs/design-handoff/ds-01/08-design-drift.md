# 08 · 设计漂移与不可机械复刻项

本清单只记录，不修复生产CSS或业务代码。严重程度表示对跨端复制的影响，不是对Web发布状态的重签。所有“建议”均为 PROPOSED_ADAPTATION；源码事实为 VERIFIED_SOURCE；历史报告单列 DOCUMENTED_ONLY。

| 编号 | 分类 | 证据与观察 | 跨端影响 | CodeArts采用方式 |
|---|---|---|---|---|
| D01 | 真实不一致／文档滞后 | `docs/design-tokens.md`自称Phase1、纯白工作区；活动`MaterialScope.tsx:15-28`全局深浅主题，`material.css:10,21-60`暖白／石墨 | 只取旧文档会变成另一套产品 | 使用本包effectiveThemes；基础色只保留原语义，不作为所有表面值 |
| D02 | 真实不一致／层叠覆盖 | `Button.tsx:21,33-35`的强蓝filled和10px圆角，被`site.css:14-16`改为中性描边与999px | 同名组件有基础API外观和当前实际外观 | 以Material实际几何、底色、文案色为默认；不要把旧蓝按钮与胶囊混用 |
| D03 | 历史遗留 | `docs/design-system.md`仍写Material试点等待确认；`docs/material-ui-site-rollout.md`写全站推广，`App.tsx`已全局套用 | 无可信统一版本号 | 用DS-01日期、HEAD和文件哈希定位；不发明“LensFlow v2设计系统” |
| D04 | 有意场景区别 | `site.css:8,48`16/18px；`material.css:142`登录20px；`photo-library.css:7`照片5px | 不能机械统一圆角 | 业务16、品牌18、图片小圆角保留；独立登录20不是所有面板默认 |
| D05 | 真实不一致／局部密度 | 4px基础节奏之外有`photo-editor.css:3,5,10`的18/26/18px；`material.css:107`22px间隔 | 把所有例外当全局规则会散乱 | 小程序收敛到4/8/12/16/24节奏，例外有具体目的才引入；这是适配提案 |
| D06 | 有意场景区别＋历史别名 | `index.css:80-81`中性#F5F5F5／#E0E0E0；实际`photo-library.css:11,16,35`与`photo-editor.css:13`为#323232 | 复制neutral命名会造成照片周边差异 | 图片预览取局部#323232，业务面板随主题；不声称基础neutral已删除 |
| D07 | 真实交互尺寸问题 | `photo-library.css:9,13`起初40px，`:25`最终覆写为28px；`:24`选择行24px；Modal关闭图标未设44px热区 | 桌面密度不可直接用于触屏 | 独立查看／勾选／关闭热区至少44×44逻辑px；视觉图标可小 |
| D08 | 缺失客户图片体验 | `SelectionPage.tsx:89-110`只渲染按钮、照片编号与Badge，没有img／canvas；摄影师`AssetGrid`才有图片 | 不能把客户选片截图当照片布局规范 | 按图库中性完整呈现原则另作原生图片网格；标PROPOSED_ADAPTATION，不抄编号空卡作为最终选片 |
| D09 | 缺失交付画廊／失效态 | `DeliveryPage.tsx:91-110`有空态、文件名、时间和下载，无最终图片画廊／独立过期态 | “大图交付、过期提示”不是已实现事实 | 服务端提供安全预览与到期字段后再映射；缺数据则明确不可用，不编造日期与质量 |
| D10 | 真实语义压缩与重复 | `OrdersPage.tsx:7-20`、`ClientPage.tsx:11-24`、`DeliveryPage.tsx:18-23`各自复制状态映射；`Badge.tsx:43-54`通用文案把WAITING_SELECTION映成“已确认” | 订单徽标与副标题可能不同义，下一动作不明确 | 状态色沿用，但标签保留“待选片／待交付”等客户词；建立单一映射表，后端状态值不改 |
| D11 | 角色边界待独立业务核验 | `OrderDetailPage.tsx`图库入口受摄影师判断；NEXT_ACTIONS对应操作区并未整体包在该判断中；`ClientPage.tsx:119-122`无状态分支地给选片／交付链接 | 抄Web会在客户页出现不合时宜入口 | 小程序仅依据服务端能力显示客户动作；DS-01不修API、不测试越权、不推断权限 |
| D12 | 真实多套断点 | 基础rem断点640/768/1024/1280；Material480/720/1000/1500；图片工作区760px | 不存在可直接全量转rpx的一套布局 | 使用手机窗口宽度／原生布局；两列缩略图在窄屏或字体放大时可退一列 |
| D13 | Web专用装饰 | `ParticlePortrait.tsx:36-47`iframe；`EffectSurfaces.tsx`Beam／Metal／Orb；`card-cursor-glow.css`鼠标光晕 | 移植造成性能和操作负担 | 全部不引入小程序运行依赖；保留构图／配色／反馈意图 |
| D14 | 历史遗留／语义偏差 | `material.css:47`--mat-white深色为#fff，浅色`:10`却为#202b3b；--color-label-inverse指向mat-page；--shadow-card被设none | 按英文名猜值会误配色 | 读取resolvedValue及具体用途，不根据white/inverse猜颜色 |
| D15 | 有意差异但状态覆盖需核验 | Button有active缩放与focus；Material filled hover覆盖底色；不存在通用selected／success；基础hover token也不保证每个组件使用 | 自动生成“全状态组件”会发明Web行为 | [04组件状态矩阵](04-component-specification.md)逐项区分现有与建议 |
| D16 | 历史文档＋未验证 | P5历史NOT_ACCEPTED与Material全站历史“32组对比通过”；本次源码已有后续改动，没运行历史业务链与人工读屏 | 旧失败不能武断说仍复现，旧通过也不能算当前验收 | 标DOCUMENTED_ONLY，交付方另做实机、角色和业务验收 |
| D17 | 平台与资产证据未决 | 原生导航安全区、最低基础库、静态肖像可分发资产、价格与排期均无本轮权威确定值 | 不能输出固定状态栏高度或捏造品牌文件 | 四个未决值留null；详见09责任表 |
| D18 | 声明层主题覆盖不完整 | `--color-brand-primary`、`--color-action-primary`、`--color-surface-neutral`等未被Material全部替换，但组件常用mat-*及局部颜色 | “已支持主题”不等于每一个旧工具类都经过全态验证 | 客户小程序按明确语义选色，只导入必要最终配对；不要批量将全部基础色当主题已审核色 |

## 不构成漂移的差异

照片周边深灰而业务浅色、品牌首页留白多而图库密度高、桌面双图灯箱和客户单图预览、公共与角色导航分开，都有场景目的。小程序改变导航栈、触摸热区和信息密度属于平台适配，不应为“像Web”强行恢复鼠标／键盘结构。

## 本次渲染的限制

隔离预览只为已提供的读接口返回夹具。图库关键词／描述元数据等未提供的接口明确503，画面中可能保留相应错误／提示；这是隔离夹具覆盖限制，不记录为生产故障。展示照片为仓库已有公开测试肖像，不是客户摄影作品，不用于证明真实客户媒体授权、色彩管理或业务质量。没有重绘或修饰截图以掩盖错误。

相关：[源审计](01-source-audit.md) · [组件规格](04-component-specification.md) · [CodeArts接入](09-codearts-integration-guide.md) · [入口](README.md)。
