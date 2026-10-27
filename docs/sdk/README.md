# SDK 版本与能力索引

这一页按 **Affinity 应用构建 + 平台 + 具体操作** 记录能力。运行时 SDK 自报的字段另列，不能代替应用版本或官网文档版本，所以文件名使用应用的完整构建号；不要把它改写成“SDK 3.3”。

操作配方按当前运行时能力通用，实测平台只是证据元数据。只有官方限制或确认过的差异，才按系统分别说明。[MCP架构](https://modelcontextprotocol.io/specification/2025-11-25/architecture)定义通用的通信与能力协商；Affinity 的[官方脚本示例](https://www.affinity.studio/help/scripting-tutorial-swap-objects/)在 Mac 和 Windows 上使用同一份 JavaScript。SDK 目前仍是 [Beta](https://sdk.affinity.studio/)，这些依据都不保证所有方法在各平台上的行为完全一致。

<a id="version-identity"></a>
## 版本身份

| 维度 | 已知值 | 依据与限制 |
| --- | --- | --- |
| 仓库插件版本 | `0.5.4` | [Codex 清单](../../.codex-plugin/plugin.json)、[共用插件清单](../../.claude-plugin/plugin.json)、[市场条目](../../.claude-plugin/marketplace.json)；这是静态仓库值，实际交付状态按[版本说明](../versioning.md)另行核对 |
| 代理报告版本 | `0.5.4` | [代理源码](../../skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs) 中的 `clientInfo.version` 与 `serverInfo.version`；静态声明，不是运行时握手证据 |
| MCP 协议默认值 | `2025-11-25` | [配置](../../.mcp.json)与[代理源码](../../skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs)；不是 SDK 版本或协议全面兼容认证 |
| 历史能力基线 | `3.2.3.4646` | [3.2.3.4646 记录](3.2.3.4646.md)所列固定提交来源，截至 2026-09-11；历史转录，没有独立复验结果 |
| 样本构建 | `Affinity 3.3.0.4850 Win32 (Sep 11 2026)` | [脱敏证据摘要](evidence/2026-10-08.md) A-01，观察于 2026-10-08；括号内是应用自报字符串，不作为发布日期 |
| MacOS 样本构建 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [批量与撤销证据](evidence/2026-10-19.md) B-01，观察于 2026-10-19；括号内同样不作为发布日期 |
| 同构建海报补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [原生设置与完整预览证据](evidence/2026-10-20.md)，观察于 2026-10-20；默认预览与完整选区 PNG 范围分别验收，另有标线检查图、透明背景负例读图及带标线总耗时，不代表新增 SDK 导出能力或通用 Agent 检出率 |
| 同构建光学对齐补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [模式、规则与中文标点证据](evidence/2026-10-20-optical-alignment.md)，观察于 2026-10-20；该次代理实际加载身份及宿主精确版本未单独记录，不继承 B-01 的插件身份 |
| 同构建文本流与异步关闭补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [E-01～E-05](evidence/2026-10-21-text-flow-and-close.md)，观察于 2026-10-21，插件 `0.5.3`、`app.buildVersion=1`；宿主精确版本未记录；覆盖两个双框样本的链接/取消链接、格式与撤销恢复，以及丢弃未保存内容的异步关闭 |
| 同构建入口/基础对象/文件补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [F-01～F-07](evidence/2026-10-21-sdk-availability.md)，观察于 2026-10-21，插件 0.5.3；覆盖入口反射、限定值对象/布尔/字符、文件/导出/保存重开 |
| 同构建已有路径画笔补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [G-01～G-04](evidence/2026-10-22-brush.md)，观察于 2026-10-22；界面准备源笔触，SDK 读取/独立克隆/改宽/复用与历史恢复通过；运行代理与宿主精确版本未独立核验 |
| 同构建导出/保存/复杂文本补测 | `Affinity 3.3.1.4940 MacOS (Oct  6 2026)` | [H-01～H-10](evidence/2026-10-22-layout-export-save.md)，观察于 2026-10-22；两页/选页、透明混排、异步保存覆盖重开、三框跨 spread 链及已知高度重排通过；链首清空、混排丢格式、出血与资源包反例分别保留，代理/宿主精确身份未独立核验 |
| SDK 自报字段 | 此前样本未记录；F-01 读到 `Environment.sdkVersionStr="0.1"` | V8 字段为 11.5.150.4；与应用 buildVersion=1、官网 `/33001/` 和插件身份分开，不回填旧实验 |
| Win32 样本的安装插件/宿主精确版本 | 原始样本未完整记录 | 仓库版本已知，不意味着每次运行加载的副本和宿主都已锁定 |
| MacOS 批量样本的插件身份 | `0.4.3`，安装副本与对应仓库代理 hash 一致 | B-01；这是该次观察时的身份，宿主精确版本未记录，不随开发候选递增或扩展到后续其他实验 |

## 构建记录

| 记录 | 证据范围 | 用法 |
| --- | --- | --- |
| [3.2.3.4646](3.2.3.4646.md) | README 声明的历史基线与随包 reference 中的案例摘要 | 查旧限制及其证据缺口；不能视为该构建全部案例的独立验证 |
| [3.3.0.4850 Win32](3.3.0.4850.md) | 2026-10-08 一次性未保存样本文档、只读接口检查及原始回包 | 以具体用例为单位判断，不继承旧版的整张成功清单 |
| [3.3.1.4940 MacOS](3.3.1.4940-macos.md) | 2026-10-19 批量/预览；2026-10-20 海报 Margin/Bleed、完整预览与光学对齐；2026-10-21 文本流/关闭、SDK 入口、基础对象/布尔/字符、文件/导出/保存重开；2026-10-22 已有路径画笔、三框跨 spread 链、混排/框架重排、多页导出、异步保存与资源包反例 | 各实验身份与操作分别记录；入口存在、限定样本通过和未验证项分开，不证明整个 SDK 可用或 Agent 工作流提速 |

没有记录的构建或平台都算未验证。记录只覆盖注明的观察点，没有中间构建的验证结果。

## 关键差异

| 操作/目标 | 3.2.3.4646 历史基线 | 3.3.0.4850 Win32 样本 | 入口 |
| --- | --- | --- | --- |
| 关闭文档 | Windows close 路径历史 `NOT_IMPLEMENTED` | 同步 `Document.close()` 关闭指定自建未保存样本，剩余文档列表为空 | [3.3 生命周期](3.3.0.4850.md#lifecycle) |
| `closeAsync` / `document.promises.close` | 旧说明报告受限 | 未重新测试 | [历史限制](3.2.3.4646.md#limits) |
| `Node.setText` 替换普通文本 | 旧 wrapper 使用缺失 `TextSelection.from` 的问题有历史记录；显式文本子选区已有替代方法 | 当前 wrapper 使用 `TextSelection.create`；普通替换读回通过 | [文本结果](3.3.0.4850.md#text) |
| 替换并保留混合格式 | 无充分通用保证 | 20px/12px 样本替换后合为单个 20px run，未达到保混排目标 | [文本结果](3.3.0.4850.md#text) |
| 多行艺术字与局部替换 | 此处不作跨版本推断 | 一个艺术字对象内三行及 24px/18px runs，run 内同长局部替换保持该样本的格式与对象完整性 | [文本结果](3.3.0.4850.md#text) |
| 段落水平 Align | 随包资料报告部分写入/读回成功 | 单个未链接框的 Left/Centre/Right 写入、读回与排文通过；其他六种模式及链接范围未测 | [Align](3.3.0.4850.md#alignment) |
| 框与内容中心 | 此处不作跨版本推断 | 框居中、内容靠左上的反例已验证；简单样本的 exact visible box 与文字边界相符 | [Align](3.3.0.4850.md#alignment) |
| 框内垂直 Align | 无可依赖的已验证 SDK 配方 | 已查 wrapper、相关原生原型和命令未发现入口；UI 功能存在不证明 SDK 可写 | [Align](3.3.0.4850.md#alignment) |
| `canHideOverflow` | 不作跨版本推断 | getter/能力读数；不能把 true 当成隐藏开关已开启 | [文本结果](3.3.0.4850.md#text) |
| 保存、PNG、画板、像素等既有案例 | 历史 reference 有指定案例 | 此样本未覆盖 | [历史能力目录](3.2.3.4646.md#capabilities) |

每一行的来源、对象范围和负例见链接的构建页。这张表是项目自己的验证账本，不是 Affinity 的官方发布说明。

### 光学对齐样本补充

`3.3.1.4940 MacOS` 上验证了 `GlyphAtts.opticalAlignmentType` 和 `StoryDelta.createOpticalAlignmentType` 的读取与写入路线，枚举值为 None/Manual/Font。自定义字符规则和左右百分比规则属于查过但没找到的 SDK 入口缺口。在界面上加入中文规则后，MCP 测量确认：固定框内段落对齐能消除这个样本的主体偏移；艺术字按含标点的对象边界重定位，仍可能偏移。模式存在、规则可编辑、主体实际对齐是三件事，要分别验收，详见[构建结果与证据](3.3.1.4940-macos.md#optical-alignment)。随包[文本选型](../../skills/affinity-mcp/references/sdk-verified.md#text-tool-choice-and-refit)与[光学对齐指引](../../skills/affinity-mcp/references/sdk-verified.md#optical-alignment-and-punctuation)分别说明策略和执行边界；Win32 旧记录保留各自的样本范围。

### 文本流与异步关闭样本补充

`3.3.1.4940 MacOS` 在 2026-10-21 用两个双框样本验证了 `createLinkTextFrame`、针对目标框的 `createUnlinkTextFrame`，以及两者各自的撤销重做。链接已有文字会合并 Story；取消链接后目标框变空，全文和已经比对过的格式留在源框，所以不能把它当作按可见文字拆分，也不能当作恢复链接前的原文。`closeAsync(callback)` 和 `document.promises.close()` 各直接关闭一个未保存的脏样本，**丢掉未保存内容，没有保存动作，也没有提示保护**。这些只说明 Mac 指定样本通过，不能改写上表 Win32 的“未重新测试”。详见[构建结果](3.3.1.4940-macos.md#linked-text-flow-and-close)和[脱敏证据](evidence/2026-10-21-text-flow-and-close.md)；它们不能证明任意文本链、格式属性或关闭后恢复。

### SDK 入口、基础对象与文件样本补充

2026-10-21 的[入口与行为证据](evidence/2026-10-21-sdk-availability.md)覆盖 455 个 API 对象、4,332 个文档原生方法；其中 4,260 个有函数入口，72 个没找到，继承限定路径另外计算。成功样本关联了 115 个方法；另外 4,142 个有入口的方法还没完成功能验收，还有两个尺寸工厂反例和一个异步复制失败。不能把 115 个关联路径当作完整的语义认证。

指定样本通过了普通 CharGlyph 插入、四种基础布尔、部分值/像素、五种同步导出、异步 PNG/CurrentSpread 及 saveAs 后重开。异步复制仍返回 NO_ENVIRONMENT；默认笔刷工厂和旧 VectorBrush 加载仍然失败。当前 Mac 异步 PNG 的实际文件和解码像素推翻了旧 hint 里“一概失败”的说法，但不据此升级其他异步、平台或出血场景。详见[构建页](3.3.1.4940-macos.md#sdk-availability)及[随包文件配方](../../skills/affinity-mcp/references/sdk-verified.md#verified-file-and-export-workflow)。

### 已有路径画笔样本补充

2026-10-22 的[已有 PathBrush 补测](3.3.1.4940-macos.md#existing-path-brush)验证了从真实笔触读取画笔、独立克隆、把宽度从 120 改成 60、应用到另一条曲线，以及两轮撤销重做。单字段 Weight/Brush/Type 掩码生效；这个样本里 All 掩码没有效果。界面准备预设不算 SDK 从零创建；默认工厂仍然失败，RasterBrush 获取仍是查过但没找到的入口。随包[复用工作流](../../skills/affinity-mcp/references/sdk-verified.md#existing-path-brush-workflow)保留这些前提，不改写 F 组的历史方法计数。

### 导出、保存与复杂文本样本补充

2026-10-22 的[扩展样本](3.3.1.4940-macos.md#layout-export-save)覆盖了三框跨 spread 排文和局部字号写入、异步保存并在覆盖自建文件后重开、透明混排与模糊效果的多格式/两页/选页导出，以及已知高度的框架重排。界面把艺术字转成框架后，格式保持但几何改变，这不是 SDK 的原位转换。以下结果都保留为未达到各自目标的反例：链首取消链接清空 Story、整篇或跨 run 替换丢格式、默认区域没有输出完整外围内容、含链接图包在原图缺失时失真。随包[文本安全](../../skills/affinity-mcp/references/sdk-verified.md#linked-text-flow)与[文件/排版配方](../../skills/affinity-mcp/references/sdk-verified.md#extended-file-and-layout-workflow)同步这些约束，不据此推导全部 SDK 可用或全平台验收。

## 结果状态怎么读

| 状态 | 含义 |
| --- | --- |
| 样本通过 | 指定构建/平台/对象上完成操作，并有与目标匹配的后置状态 |
| 有限通过 | 只达到部分目标；必须写出未达到的部分，例如字符串替换成功但混排格式丢失 |
| 样本失败 | 指定用例有直接失败或无效结果；同时记录错误阶段，不推广成整个模块不可用 |
| 只读确认 | 查到函数、类型、getter 或元数据；不表示写入行为通过 |
| 已查入口缺口 | 列明检查范围及未找到的入口；不宣称穷尽 SDK |
| 历史记录 | 继承既有版本记录，本页没有独立重跑；说明版本绑定是否完整 |
| 未验证 | 没有足以支持该用例的证据；不是“不支持” |

证据形式另行标注：源码声明、运行回包、文件检查、渲染像素、执行者视觉观察等。结果状态与证据形式不能互相替代。

## 如何选择实际操作

先核对目标应用的构建、平台和对象，再读同版本记录、当前 preamble 和相关的 SDK topic。公共 wrapper 优先；怀疑 native 参数时，查它的 imports、签名和范围。实时 hints 只是线索，不能覆盖用户授权，也不能盖过同版本里的实际后置结果。见[随包发现规则](../../skills/affinity-mcp/SKILL.md)和[版本冲突记录](3.3.0.4850.md#guidance)。

旧资料与新证据冲突时，两条都保留，并写明各自适用的构建；新的对象种类、链接文本、混排格式或文件导出目标仍需要自己的样本。过程见[验证与记录方法](verification.md)。

版本差异和文本工作流的内部待办由本地 tracker 维护；本页只保留可复用的构建条件、证据等级和能力边界，不链接个人工作记录或原始 issue。
