# SDK 入口、基础对象与文件能力样本

观察日期：2026-10-21。本文保存可以公开的合成样本和操作后的结果摘要，不含原始回包、运行时标识、个人文件路径或本机调查记录。入口反射、脱离文档的值对象、文档中的实际效果和真实文件分别验收。本次没有逐方法执行整个 SDK，所以函数存在不等于全部功能可用。

<a id="f-01"></a>
## F-01：身份与全量入口口径

- 应用自报 `Affinity 3.3.1.4940 MacOS (Oct  6 2026)`，`app.buildVersion=1`；调用入口插件为 `0.5.3`，宿主精确版本未记录。
- 本次读到 `Environment.sdkVersionStr="0.1"`、`Environment.v8VersionStr="11.5.150.4"`。这些是运行时自报的字段，不是插件版本，也不是官网文档版本；不会用来回填此前没有记录的实验。文件/网络权限的读数为 true、GenAI 为 false，不构成操作授权。
- 官方 `latest` 当次重定向到 `/33001/`。声明以[官方符号索引](https://sdk.affinity.studio/33001/js/objects.inv)和应用内 wrapper topics 为依据；对 native API 对象逐项读取描述符和原型链，不调用未知的 getter 或带副作用的方法。

| 口径 | 数量与结果 |
| --- | --- |
| 官方 inventory 记录 | 10,440；包括页面、类型、枚举等，不是方法数 |
| native 模块 / API 对象及对应 API 主题 | 20 / 455，主题与对象逐一匹配 |
| 官方原生 API 方法声明 | 4,332 |
| 有直接运行时函数入口 | 4,260，仅为只读确认 |
| 声明存在但运行时未找到 | 72：71 个 NodeDefinition 派生类型的 `fromNodeDefinition`，以及 `CommandApi.areEqual`；不否定整个类型 |
| 额外继承限定路径 | 4,884；与直接路径合计 9,144，继承别名不计作新增功能 |
| 非 API 对象的值方法 | `CurveNode.assign`、`Rectangle.clone`、`Size.clone` 三个方法存在，本次未分别执行其行为 |
| 顶层 JS topic / 可 require 的模块 | 68 / 67，`/vectorbrush.js` 可读但无法加载 |

官方的 `js:class` 分类包含 handle/enum/value class，不能拿来当 API 对象统计。空的 own-property 列表也不能证明接口不存在，因为方法可能挂在原型链上。

本组共 58 个用例：值/工厂 43 个、布尔 4 个、字符插入 1 个、文件 10 个。52 个达到限定目标，另外有两个工厂语义反例、两个默认笔刷工厂报错、一个旧模块加载报错和一个异步复制报错。成功用例按实际调用路径关联到 115 个文档原生方法，**这不是 115 个方法各自的完整语义认证**。在 4,260 个有入口的方法中，另有两个原生工厂反例和一个原生异步复制失败，剩余 4,142 个还没有完成独立功能验收；wrapper 级的笔刷/模块错误，也不会因此算成底层原生方法已经执行。

<a id="f-02"></a>
## F-02：值对象、像素与 Shape

| 对象/操作 | 后置结果 | 边界 |
| --- | --- | --- |
| Point 距离 | (0,0) 至 (3,4) 距离 5，平方距离 25 | 指定数值 |
| Transform 平移/逆变换 | (3,4) 平移 (10,20) 得 (13,24)，逆变换回到 (3,4) | 指定平移，不覆盖其他矩阵 |
| 矩形 Curve clone/translate | 原 (10,20,30,40) 保持；克隆平移 (5,7) 后为 (15,27,30,40)，closed/rectangle 为 true | 未验证任意曲线 |
| Colour RGBA8 clone | (12,34,56,alpha=200) 原值保持 | 不覆盖其他色彩空间 |
| Buffer UTF-8 clone | 合成中英文字符串及 14 字节长度保持 | 不扩展为所有编码/共享内存语义 |
| RGBA8 Bitmap | 4×4，写入 (1,2) 的 (12,34,56,255)，`createCompatibleBitmap(true)` 后读取相同 | 单点写读与兼容复制；不覆盖其他格式/stride/filter |
| Font 默认对象 | `Font.createDefault().postscriptName` 读到 ArialMT | 不证明所有字体映射 |
| 25 种 Shape create/clone | 两个对象的 shapeType 均符合预期 | 脱离文档的创建、克隆和类型；未逐项修改参数或渲染节点 |

Shape 集合为 Arrow、CalloutEllipse、CalloutRectangle、Cat、Cat2、Cat3、Cat4、Cloud、Cog、Crescent、Diamond、DoubleStar、Ellipse、Heart、Pie、Polygon、Rectangle、Segment、Spiral、SquareStar、Star、Tear、Trapezoid、Triangle、QRCode（类名前均加 `Shape`）。QRCode 只验证创建/克隆类型，不证明编码有效，也不证明输出可以扫描。

<a id="f-03"></a>
## F-03：四种布尔命令与恢复

自建的 640×480px、96 DPI、单 spread 样本包含四对黑色矩形。每对 A=(40,y,120,50)、B=(100,y,120,50)，y 分别为 40/140/240/340。`Selection.create(doc, [A,B])` 交给 `DocumentCommand.createBoolOpUnion/Subtract/Intersect/Xor`，再由 `doc.executeCommand` 执行。

| 命令 | 实际 PolyCurve 边界 x/width | x=70/130/190 的内部覆盖 |
| --- | --- | --- |
| Union | 40 / 180 | 111 |
| Subtract | 40 / 60 | 100 |
| Intersect | 100 / 60 | 010 |
| Xor | 40 / 180 | 101 |

每次操作的 undo/redo/undo/redo 都匹配留存的目标/保护节点标记、类型、baseBox 和六个变换分量。最终左侧 280×480 区域在排除已知边缘附近的一像素带后，122,208 个像素与预期覆盖零差异。样本不建立复杂路径、开放轮廓、描边/效果、其他选区顺序或任意历史的保证。

<a id="f-04"></a>
## F-04：普通字符插入

同构建的单个 250×100px 框架文本，原文 AB、ArialMT、16 document pixels。在 `Selection` 上添加 `TextSelection.create({begin:1,end:1})`，执行 `DocumentCommand.createInsertGlyph(selection, CharGlyph.create(33))`，全文成为 A!B，渲染可见。字体/字号、框、变换、textRenderScale 和其他布尔节点保持不变；undo/redo/再次 undo 都恢复到留存状态。

这个样本说明，旧的 `expected GlyphHandle` 失败不适用于本次普通字符路线，但不删除旧构建的失败记录。它不覆盖特殊 glyph、任意 code point、缺字字体、混排、链接文本或复杂字符映射。

<a id="f-05"></a>
## F-05：尺寸与笔刷反例

| 路线 | 实际结果 | 处理 |
| --- | --- | --- |
| ExportScale 单参数工厂 | Width(600)、Height(800)、Square(600)、Multiplier(2) 的类型/有效字段符合预期 | 仅尺寸对象读回；本次导出未使用这些自定义 scale |
| `createWithWidthHeight(600,800)` | sizeType=Square(3)、size=800、multiplier=600、width=800、height=0 | 与预期语义不符；不作为 WidthHeight 配方 |
| `createWithMultiplierSquare(2,600)` | sizeType=WidthHeight(4)、size=2、multiplier=0；保留探针未记录 width/height | 与预期语义不符；原因未确定，不交换工厂名绕过 |
| `PathBrush.createDefault()` | wrapper 抛出 `not yet implemented in C++ API` | 不记作 native 调用通过 |
| `RasterBrush.createDefault()` | 同类 wrapper 占位错误 | 不证明整个笔刷模块失效 |
| `/vectorbrush.js` | require 无法解析；当前导出未见 VectorBrushApi | topic 可读不等于可加载 |
| `LineStyle.createDefaultWithWeight(2)` | weight=2；当前字段为 `pathBrush`，实线读到 null，旧 `vectorBrush` 为 undefined | 不声称已取得可用笔刷，不伪造 handle |

<a id="f-06"></a>
## F-06：真实文件、导出与保存重开

实验在明确授权的 Desktop 专用临时目录内执行，所有路径都先检查不存在；只使用自建 640×480px、96 DPI、单 spread 文档，白底和三个黑矩形。原生输出、文件独立解码和文档保存状态分别检查。

| 用例 | 后置结果与状态 |
| --- | --- |
| UTF-8 文件写入/读取 | `SDK 临时内容` 加换行，17 字节；内容一致，样本通过 |
| 同步 `fs.copyFile(..., CopyOptions.None)` | 副本内容与原文件字节/hash 一致，样本通过 |
| `FileSystemPromises.copyFile` | 实际 `Error: NO_ENVIRONMENT`，目标文件不存在，样本失败 |
| 同步 PNG / WebP / 异步 PNG | 各为 640×480；每个输出全部 307,200 像素与黑白几何 oracle 完全一致，样本通过 |
| 同步 JPEG | 640×480；排除各已知边缘附近 8px 带后，214,500 像素零差异；不证明有损边缘逐像素一致 |
| 同步 SVG | viewBox=`0 0 640 480`；四个矩形的顺序、坐标、宽高和黑白填充语义一致 |
| 同步 PDF | 单页 MediaBox=480×360pt；独立按96 DPI渲染为640×480，排除2px边缘带后287,364像素零差异，并读图确认 |
| `doc.saveAs(path)` 与重开 | 实际392,454字节文件，path匹配、dirty/needsSaving均false；关闭重开后四节点/几何/变换/DPI一致，MCP渲染字节一致 |

五种同步导出和异步 PNG 都使用 `FileExportArea.createForCurrentSpread()`。预设名称取自实时的 `FileExportOptions.allPresetNames`，本样本选了 `PNG`、`JPEG (最佳质量)`、`SVG (用于导出)`、`PDF (用于导出)`、`WebP (无损，默认值)`，不能假定其他语言或安装使用相同名称。异步路线是 `await doc.promises.export(path, options, area)`，脚本返回 async IIFE；等它完成后读取导出记录和文件。所有导出记录都是 OK，没有 warning/error。

同步与异步 PNG 的解码像素完全相同，但文件字节并不相同；逐块比较只有 iTXt 元数据块不同，IDAT 和其他块一致。文件 hash 不相等，不能代替像素验收。旧 hints 说“Mac 异步 PNG 一概 NO_ENVIRONMENT”，这不适用于本样本；异步复制的失败也不能推广到文档导出。

本次文件共 10 例，按写读、同步复制、异步复制、五种同步导出、异步 PNG、saveAs/重开计数，9 例达到目标，异步复制 1 例失败。没有覆盖文字/字体嵌入、照片、透明度、复杂效果、出血、其他区域/尺寸/预设、多页、覆盖已有文件、异步保存或包资源；两个 ExportScale 反例也没有用于导出。

<a id="f-07"></a>
## F-07：证据与适用边界

以上证据分别来自几何/字段读回、实际文本、撤销恢复、渲染像素和独立文件解码；公开记录保留数值摘要，没有附可以重看的原始截图或文件。原始探针、文件和渲染只在本地留存，不作为本文的引用依赖。指定样本已经关闭，专用目录和输出已经清理，既有文稿没有被修改。

115 个关联方法之外的 4,142 个有入口方法仍未验证；72 个缺失声明仍是入口缺口；两个原生尺寸反例和一个原生异步复制失败仍保持失败/有限结果。UI、网络、OS、全局设置、AI 以及其他有外部副作用的路线，都没有因为这次盘点获得行为通过或额外授权。跨平台等效性、其他构建和对象都还没有完成验收；但这不能当成把配方限制在样本系统上的依据，也不能据此声称所有系统都通过了同样的验收。实际使用要按当前入口、权限、对象和操作后的结果来判断。
