<p align="center">
  <img src="assets/affinity-mcp-icon.svg" width="112" height="112" alt="Affinity MCP">
</p>

<h1 align="center">Affinity MCP</h1>

<p align="center">连接 AI 客户端与 Affinity by Canva 的本地 Model Context Protocol (MCP) 插件</p>
<p align="center"><a href="README.md">English</a> | 简体中文</p>
<p align="center">
  <a href="#快速开始">快速开始</a> ·
  <a href="#功能特性">功能特性</a> ·
  <a href="#使用须知">使用须知</a> ·
  <a href="#隐私与条款">隐私与条款</a>
</p>

<a id="快速开始"></a>
<a id="开始使用"></a>

## 快速开始

### 环境要求

- **Affinity by Canva**（需与 AI 客户端运行在同一台设备上）
- **Node.js** 24.20 及以上（推荐 24.21+）
- 支持插件的客户端：**Codex**、**ZCode** 或 **Claude Code**

### 1. 启用 MCP 服务

打开 Affinity 的 **设置 → Model Context Protocol**，开启 **Enable Affinity MCP**。

<details>
<summary>查看设置面板截图与权限说明</summary>

![Affinity 的 Model Context Protocol 设置面板](assets/affinity-mcp-settings.png)

默认服务地址为 `http://localhost:6767/sse`。其他权限开关根据实际需求配置：

| 权限类别 | 设置项 | 说明 |
| --- | --- | --- |
| 桌面文件读写 | **Access files on your Desktop** | 仅允许访问当前用户的桌面目录，非整盘访问。 |
| 读取预存脚本 | **Use saved scripts** | 允许读取 Affinity 脚本面板中的脚本。 |
| 保存脚本至面板 | **Save scripts to your scripting panel** | 允许将生成的脚本保存到脚本面板。 |
| 本地任务提示记录 | **Save task hints to your device's local memory** | 在本地存储任务上下文提示。 |
| 脚本网络访问 | **Access networks** | 允许脚本发起网络请求；关闭不影响 MCP 本地连接。 |
| Canva AI 工具 | **Use Canva AI Studio features** | 允许调用 Canva AI 能力（部分高级功能消耗 Canva 月度配额）。 |
| 匿名提示共享 | **Share task hints with Affinity** | 向 Affinity 分享匿名任务提示（可选）。 |

</details>

<a id="安装"></a>

### 2. 安装插件

**Codex**：在插件市场搜索并安装 `affinity-mcp`，或在终端执行：

```shell
codex plugin marketplace add Paloexiz/Affinity-MCP
codex plugin add affinity-mcp@affinity-mcp
```

<details>
<summary>Claude Code</summary>

在终端添加市场源并安装：

```shell
claude plugin marketplace add https://github.com/Paloexiz/Affinity-MCP.git
claude plugin install affinity-mcp@affinity-mcp
```

</details>

<details>
<summary>ZCode</summary>

进入 **设置 → 插件 → 创建 → 添加插件市场**，输入 `Paloexiz/Affinity-MCP` 后在个人市场中安装 **affinity-mcp**，亦可直接添加本地仓库路径。

</details>

> [!NOTE]
> 需安装完整插件以自动注册 MCP 服务；单独安装 Skill 无法建立服务连接。

### 3. 连接验证

在 AI 客户端中输入以下指令测试连接：

> 连接 Affinity 并列出当前打开的文档，无需做任何修改。

<a id="功能特性"></a>
<a id="可以帮你做什么"></a>
<a id="目前支持的功能"></a>

## 功能特性

| 模块 | 支持的功能 |
| --- | --- |
| 文本排版 | 创建艺术字与框架文本，修改内容、字体、字号、段落样式及文本框串联。 |
| 图层管理 | 图层检索、选中、重命名、图层移动，以及锁定与可见性状态切换。 |
| 页面版式 | 对象对齐、尺寸调整、页边距设置，基础矢量形状绘制及填充/描边样式配置。 |
| 文档与导出 | 原生文档的保存与重开，支持导出为 PNG、JPEG、SVG、PDF 及 WebP 格式。 |

调用示例：

> 将当前选中的文本框左对齐，并保持字号不变。

详细操作支持与限制边界请参考[操作指南](skills/affinity-mcp/SKILL.md#supported-operations)与[实测验证用例](skills/affinity-mcp/references/sdk-verified.md#version-boundaries)。

<a id="使用须知"></a>
<a id="不支持或尚未验证的功能"></a>

### 使用须知

- **文档关闭与保存**：在异步关闭文档时，程序不会触发保存提示弹窗，未保存的修改将被直接丢弃。执行关闭操作前须显式保存文档。
- **文本框断开行为**：解除两个文本框的链接后，合并后的全部文本将保留在源文本框中，目标文本框将被置空，不会自动还原拆分前的内容。
- **文本排版与渲染**：中文避头尾、混合样式和文字溢出需在界面中核对最终视觉效果；请根据排版需求选用艺术字（Artistic Text）或框架文本（Frame Text）。详见[文本排版说明](skills/affinity-mcp/references/sdk-verified.md#text-tool-choice-and-refit)。
- **文件导出验证**：基础格式导出成功并不保证出血位（Bleed）、多页排版、字体嵌入或自定义尺寸均符合预期，导出后应进行人工核验。详见[导出验证范围](skills/affinity-mcp/references/sdk-verified.md#verified-file-and-export-workflow)。
- **超时处理规范**：请求超时并不代表操作未执行；相关脚本可能已在后台完成。重试前应先检查文档当前状态，避免产生重复修改。

<details>
<summary>已知功能边界</summary>

MCP 接口无法覆盖 Affinity 桌面端界面的全部功能。例如：自定义中文标点悬挂规则、文本框垂直居中对齐，目前在 SDK 中均无可用配置接口；默认画笔创建与异步文件复制操作在当前版本仍会抛出异常。复杂的文本框串联、高级选区等未经验证的特性，不建议在生产流程中直接使用。

完整的功能边界与验证记录参见 [SDK 说明](skills/affinity-mcp/references/sdk-verified.md)；连接、权限与脚本执行问题请查阅[排错指南](skills/affinity-mcp/references/scripting-pitfalls.md)。

</details>

<a id="常见问题"></a>

## 常见问题

| 现象 | 排查方案 |
| --- | --- |
| 无法建立连接 | 检查 Affinity 是否处于运行状态并已启用 MCP 开关；确认当前环境的 Node.js 版本符合要求（`node --version` ≥ 24.20，推荐 24.21+）。注意：客户端工具列表中出现工具项并不代表后端已成功建立连接。 |
| 工具项重复显示 | 检查并禁用其他重复提供 Affinity 工具的插件或 MCP 配置项。 |
| 更新后配置未生效 | 在客户端刷新插件市场并重新加载插件，随后重启会话以清除旧版工具和 Skill 缓存。 |
| 文件操作权限被拒 | 确认 Affinity 设置中已开启 **Access files on your Desktop**，且目标文件位于系统桌面目录范围内。 |

<details>
<summary>插件更新流程</summary>

在各客户端中刷新市场源并执行更新：

**Codex CLI**：

```shell
codex plugin marketplace upgrade affinity-mcp
codex plugin add affinity-mcp@affinity-mcp
```

**Claude Code**：

```shell
claude plugin marketplace update affinity-mcp
claude plugin update affinity-mcp@affinity-mcp
```

**ZCode**：在个人市场中刷新后执行更新。更新完成后建议重启客户端会话，以加载最新的工具及规范文档。

历史版本变更记录详见[更新日志](CHANGELOG.zh-cn.md)（[English](CHANGELOG.md)）。

</details>

### 下载发布归档

对于提供归档的正式版本，从同一个 [GitHub Release](https://github.com/Paloexiz/Affinity-MCP/releases) 下载三项附件：`affinity-mcp-<version>.zip`、`release-manifest.json` 和 `SHA256SUMS`。旧版本可能没有这些附件。应选择上述命名的 ZIP 附件；GitHub 自动提供的 **Source code** 压缩包是另一种文件。

在下载目录中，Linux 执行 `sha256sum -c SHA256SUMS`，macOS 执行 `shasum -a 256 -c SHA256SUMS`。Windows PowerShell 对 ZIP 和 manifest 两个文件分别使用 `Get-FileHash -Algorithm SHA256`，将结果与 `SHA256SUMS` 中各自对应的行比较。两项都必须一致。

这些归档用于下载与内容核对，安装、更新仍使用上文的插件市场，不支持手动 ZIP 安装。校验值只能发现字节差异，单独不能证明发布者身份、客户端加载、缓存刷新或真实 Affinity SDK 操作成功。manifest 标明源提交、生产树及验证范围；实际模拟测试结果单独记录，不写入可复现归档。

<a id="检查真实安装连接"></a>
<details>
<summary>高级：本地连接冒烟测试</summary>

保持 Affinity 运行并开启 MCP，在插件根目录下执行：

```shell
node skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs --plugin-root "<absolute-plugin-root>" --config codex
```

将 `<absolute-plugin-root>` 替换为实际安装目录的绝对路径；Claude Code / ZCode 环境请指定 `--config shared`。

该脚本仅校验本地清单、代理版本并完成服务握手与工具发现，不执行文档修改脚本，亦不修改文档数据、系统设置或脚本库。测试通过仅验证底层服务接口可连通，不代表客户端图形界面实际加载了该副本，也不代表具体文档操作必然成功。

</details>

<a id="隐私与条款"></a>

## 隐私与许可条款

插件默认仅在本机与 Affinity 本地服务通信。但通过 MCP 返回至 AI 客户端的文档数据、文本内容及图像预览，将由客户端发送至其配置的模型提供方。使用前请参阅[隐私政策](PRIVACY.zh-cn.md)与[服务条款](TERMS.zh-cn.md)。

本项目为 [Paloexiz](https://github.com/Paloexiz) 维护的开源社区项目，非 OpenAI、Z.ai、Anthropic、Canva 或 Affinity 官方产品。问题与反馈请提交至 [GitHub Issues](https://github.com/Paloexiz/Affinity-MCP/issues)（公开渠道，提交前请对敏感信息进行脱敏处理）。

## 项目说明与致谢

开发渠道与版本管理规范参见[版本说明](docs/versioning.md)。

插件目录架构参考 [Superpowers](https://github.com/obra/superpowers)；ZCode 依其[插件兼容能力](https://zcode.z.ai/cn/docs/plugin)复用该结构；Claude Code 集成遵循官方[插件规范](https://code.claude.com/docs/en/plugins-reference)与[市场规范](https://code.claude.com/docs/en/plugin-marketplaces)。

代理实现与配套 Skill 改编自 [deba33/codex-plugins-by-deba33](https://github.com/deba33/codex-plugins-by-deba33)（源提交为 Paloexiz fork 版本的 `9f2c2db`）。上游 MIT 许可与版权声明保留在 [LICENSE.upstream](LICENSE.upstream) 与 [NOTICE](NOTICE) 中，本项目采用 [MIT 许可证](LICENSE)。
