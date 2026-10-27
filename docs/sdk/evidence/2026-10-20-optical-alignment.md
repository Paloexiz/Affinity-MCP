# 3.3.1.4940 MacOS 光学对齐与中文标点证据

观察日期：2026-10-20。本页记录光学模式的读写、界面自定义规则和中文主体偏移。段落排文、文字锚点和对象边界对齐不是同一种操作，本页不把它们混在一起。

<a id="d-01"></a>
## D-01：身份、样本与测量

应用自报 `Affinity 3.3.1.4940 MacOS (Oct  6 2026)`。这次没有单独记录 SDK 独立版本、代理实际加载的身份和宿主精确版本；因此不能继承[早期批量样本](2026-10-19.md#b-01)的插件身份，也不能用仓库候选版本代填。

两批样本各自使用自建、未保存的 1180 × 1060 document pixels、96 DPI、单 spread 文档。每批有 84 个独立的单行文字对象，按 Art/Frame × 两种字体 × 三组模式 × 七种字符串组合；两种字体是 `PingFangSC-Regular` 和 `STSongti-SC-Regular`。字体高度 24 document pixels，Frame 使用 250 × 29 的固定框。七种字符串为 `中文排版`、`“中文排版”`、`「中文排版」`、`（中文排版）`、`中文排版。`、`中文排版，`、`"中文排版"`。

首批比较 None/Manual/Font，第二批比较 None/Manual/Custom。**Custom 是经界面自定义规则的 Manual 样本标签，不是第四种 SDK 枚举。** 同一批的各个阶段重复测量同一组对象，不是新增独立样本。全文、字体、高度和模式都会读回；界面规则只作用于 28 个 Custom 对象，56 个 None/Manual 对照保持不变。

字形轮廓用 `node.curvesInterface.polyPolyCurves` 和 `node.baseToSpreadTransform` 测量，不需要把可编辑文字转曲。本次的简单字符串先逐项匹配轮廓项和码点，再单独合并四个汉字的边界；这不推广为任意字体、连字或复杂脚本的“一字一轮廓”保证。下表的偏移都相对于**同字体、同组、同对齐操作的无标点 `中文排版` 主体**：正数向右，负数向左，单位是 document pixels。偏移为零，不代表字体侧承已经消除，也不代表和任意对象绝对视觉对齐。

<a id="d-02"></a>
## D-02：模式接口与自定义规则入口分开

| 入口 | 观察与结果 |
| --- | --- |
| `/glyphatts.js` 的 `GlyphAtts.opticalAlignmentType` | getter/setter 分别调用 `GlyphAttsApi.getOpticalAlignmentType` / `setOpticalAlignmentType`；独立属性对象上三模式设定与读回通过 |
| `/storydelta.js` 的 `StoryDelta.createOpticalAlignmentType(type)` | 调用 `StoryDeltaApi.createOpticalAlignmentTypeDelta(type)`；对 Art/Frame 的显式文本子选区格式化，实际模式读回与渲染通过 |
| `OpticalAlignmentType` | 枚举为 `None=0`、`Manual=1`、`Font=2`；开启 Manual 不等于新增字符规则 |
| 自定义字符集合、左右悬挂百分比 | **已查入口缺口**：已查安装应用的 JS wrappers、`story`/`dom`/`commands`/`application`/`common`/`fonts` 原生模块及相关原型、字符属性枚举，未找到对应规则表读写入口；官方 `latest` 和 `33001` 的完整符号索引各 10,440 项也只见模式相关光学入口。不是 MCP 协议限制或穷尽所有内部接口的证明 |

公开依据：[模式 getter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/getOpticalAlignmentType.html)、[setter](https://sdk.affinity.studio/33001/js/apis/GlyphAttsApi/setOpticalAlignmentType.html)、[delta](https://sdk.affinity.studio/33001/js/apis/StoryDeltaApi/createOpticalAlignmentTypeDelta.html)、[枚举](https://sdk.affinity.studio/33001/js/enums/OpticalAlignmentType.html)、[符号索引](https://sdk.affinity.studio/33001/js/objects.inv)。这些 API 声明和本页的实际样本结果各自提供证据；文档路径不作为独立的 SDK 发布版本号。

样本中使用的模式应用路线如下。前提是已经核对目标身份和授权，并且操作对象是本页的未链接文本范围：

```js
const { Selection, TextSelection } = require('/selections.js');
const { DocumentCommand } = require('/commands.js');
const { StoryDelta, OpticalAlignmentType } = require('/storydelta.js');
const selection = Selection.create(doc, textNode);
selection.addSubSelectionForNode(textNode,
  TextSelection.create(textNode.storyRange));
doc.executeCommand(DocumentCommand.createFormatText(selection,
  StoryDelta.createOpticalAlignmentType(OpticalAlignmentType.Manual)));
```

应用后读取 `textNode.story.getGlyphAttRunsFrom(0)` 中的 `glyphAtts.opticalAlignmentType`，并检查实际轮廓和渲染。有一次 hints 查询声称没有光学对齐 API，这与上面的 wrapper 和实际模式写读不符；hints 没命中不能当作“没有接口”的依据。这条模式路线不能写入下一节的自定义规则表。

<a id="d-03"></a>
## D-03：未自定义的 Manual 与 Font

这里的 Manual 指本次没有编辑字符规则的对照；它不承诺所有安装、模板或样式的默认规则都一样。这一阶段有两种操作：保持艺术字的原文字锚点，或者在固定框内把段落设为 Left。

| 对象/操作与字符串 | 字体 | None | Manual | Font |
| --- | --- | ---: | ---: | ---: |
| Art 原锚点 / Frame Left，`“中文排版”` 的主体左边 | 苹方 | 12.888 | 0 | 12.888 |
| 同上 | 宋体 | 9.336 | 0 | 0 |
| Art 原锚点 / Frame Left，`「中文排版」` 的主体左边 | 苹方 / 宋体 | 24 / 24 | 24 / 24 | 8.4 / 24 |
| Art 原锚点 / Frame Left，`（中文排版）` 的主体左边 | 苹方 / 宋体 | 24 / 24 | 24 / 24 | 7.128 / 24 |
| Frame Right，`中文排版。` 的主体右边 | 苹方 / 宋体 | -24 / -24 | -24 / -24 | -9.12 / -24 |
| Frame Right，`中文排版，` 的主体右边 | 苹方 / 宋体 | -24 / -24 | -24 / -24 | -6.264 / -24 |
| Frame Centre，`中文排版。` 的主体中心 | 苹方 / 宋体 | -12 / -12 | -12 / -12 | -4.56 / -12 |
| Frame Centre，`中文排版，` 的主体中心 | 苹方 / 宋体 | -12 / -12 | -12 / -12 | -3.132 / -12 |

这组 Manual 能改善引号，但不会自动涵盖 `「」（）。，`；Font 的效果随字体和操作变化，不能概括成全部有效或全部无效。[产品光学对齐概念](https://affinity.help/publisher2/en-US.lproj/pages/Text/opticalAlignment.html)只作 V2 背景，不能替代本构建的 SDK 证据。

<a id="d-04"></a>
## D-04：界面规则生效不等于对象边界忽略标点

在 Affinity 字符面板的光学对齐规则里，把一条左右均为 **100%** 的 Manual 规则的字符集合设为 `"'“”‘’「」（）。，`，并移除测试中的重复零百分比规则。随后用 MCP 格式命令切换段落对齐并测量，已有的界面规则继续影响本样本的排文。**自定义规则由 UI 设置，MCP 负责模式/段落操作和测量；没有实测 SDK 规则表写入。** 双侧 100% 只用于受控验证，不是所有中文排版的推荐百分比。

| 操作与代表字符串 | None / 未自定义 Manual | UI Custom | 适用范围 |
| --- | ---: | ---: | --- |
| Art 保持原文字锚点，`「中文排版」` / `（中文排版）` 主体左边 | 24 / 24 | 0 | 两字体；艺术字也能产生悬挂效果 |
| Frame Left，同上 | 24 / 24 | 0 | 两字体，框尺寸保持 |
| Frame Right，`「中文排版」`、`（中文排版）`、句末 `。` / `，` 主体右边 | -24 / -24 | 0 | 两字体 |
| Frame Centre，句末 `。` / `，` 主体中心 | -12 / -12 | 0 | 两字体 |
| Art 按对象左边重新定位，`「中文排版」` 主体左边 | 10.92 / 10.92 | 10.92 | 苹方；宋体约 11.954667，三组同样保持 |
| Art 按对象左边重新定位，`（中文排版）` 主体左边 | 9.648 / 9.648 | 9.648 | 苹方；宋体约 11.162667，三组同样保持 |
| Art 按对象右边重新定位，闭括号/句末 `。` / `，` 主体右边 | -24 / -24 | -24 | 两字体，三组同样保持 |

所谓“按对象边界重新定位”，是在每个对象当前的 `getSpreadVisibleBox(false)` 上计算平移量，让左边、右边或中心落到相应的参照位置。这不是原生对象对齐命令的写入测试。这样定位仍然包含标点和相关的排文空间，可能抵消文字锚点下得到的悬挂收益。这个结果不说明艺术字不能悬挂，也不把固定框段落对齐和艺术字外接边界对齐当成同一个算法。

下图三列分别是 None、未自定义 Manual 和 UI Custom。每组第一行是无标点基线；四个区块依次是艺术字的苹方、框架文本的苹方、艺术字的宋体和框架文本的宋体。红线标出固定栏边，中心对照的轴取两条栏边的中点。图片只用于可视对照，数值以 SDK 测量为准。

![保留艺术字原文字锚点；框内段落 Left](../../../assets/sdk-evidence/optical-alignment-anchor-left.jpg)

![艺术字按对象右边平移；固定框内段落 Right](../../../assets/sdk-evidence/optical-alignment-object-right.jpg)

![艺术字按对象中心平移；固定框内段落 Centre](../../../assets/sdk-evidence/optical-alignment-object-center.jpg)

两批指定的临时文档最终都关闭且未保存，重新枚举结果为空；既有文稿没有被修改。以下内容未验证：其他构建或平台、其他字体和字号、多行自动换行、链接文本、混排、效果/裁切、改字后规则是否持续、规则模板复制，以及保存/打印。随包旧版文本定位配方把全部字形当作内容边界；本页的“中文主体”另行排除标点，所以不能直接把全部字形边界套成主体光学对齐公式。仓库 docs 有增补，不代表随包指引或已安装插件已经刷新。
