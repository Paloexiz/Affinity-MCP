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

默认服务地址是 `http://localhost:6767/sse`。其余权限按实际需要开启：

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

进入 **设置 → 插件 → 创建 → 添加插件市场**，输入 `Paloexiz/Affinity-MCP` 后在个人市场中安装 **affinity-mcp**，也可以直接添加本地仓库路径。

</details>

> [!NOTE]
> 需要安装完整插件才能自动注册 MCP 服务；单独安装 Skill 无法建立服务连接。

### 3. 连接验证

在 AI 客户端里发送下面这句话，确认能连上：

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

每项操作的范围、限制和已验证用例，见[操作指南](skills/affinity-mcp/SKILL.md#supported-operations)与[实测验证用例](skills/affinity-mcp/references/sdk-verified.md#version-boundaries)。

<a id="使用须知"></a>
<a id="不支持或尚未验证的功能"></a>

### 使用须知

- **保存与关闭文档**：异步关闭文档时不会弹出保存提示，未保存的修改会直接丢掉。关闭前请先显式保存。
- **文本框取消链接**：在我们测过的样本里，取消链接的框只要不是链首，全文就都留在上游框，它自己和后面的链都是空 Story。它不会按屏幕上看到的文字拆开，也不会还原成链接前各自独立的文本。对链首框取消链接可能清空整篇 Story，所以普通断链操作要先排除链首目标。已测构建、目标前提和验证边界见[文本流说明](skills/affinity-mcp/references/sdk-verified.md#linked-text-flow)；这些结果不能推广到所有文本链或版本。
- **排版效果要在界面上确认**：中文避头尾、混合样式和文字溢出，最终以画布上的效果为准；选艺术字（Artistic Text）还是框架文本（Frame Text），按排版需要决定。详见[文本排版说明](skills/affinity-mcp/references/sdk-verified.md#text-tool-choice-and-refit)。
- **导出文件要自己核验**：基础格式导出成功，不代表出血位（Bleed）、多页排版、字体嵌入或自定义尺寸都符合预期；导出后请人工检查。详见[导出验证范围](skills/affinity-mcp/references/sdk-verified.md#verified-file-and-export-workflow)。
- **超时怎么处理**：请求超时不等于操作没执行，脚本可能已经在 Affinity 里跑完了。重试前先看文档当前状态，避免同一处修改做两遍。

<details>
<summary>已知功能边界</summary>

MCP 接口覆盖不了 Affinity 桌面端的全部功能。比如自定义中文标点悬挂规则和文本框垂直居中对齐，目前在 SDK 里都没有可用的配置入口；默认画笔创建和异步文件复制在当前版本里仍会抛出异常。复杂的文本框串联和高级选区没有验证过，不建议直接用在正式流程里。

完整的功能边界与验证记录见 [SDK 说明](skills/affinity-mcp/references/sdk-verified.md)；连接、权限和脚本执行的问题见[排错指南](skills/affinity-mcp/references/scripting-pitfalls.md)。

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

<a id="检查真实安装连接"></a>
<details>
<summary>高级：本地连接冒烟测试</summary>

保持 Affinity 运行并开启 MCP，在插件根目录执行：

```shell
node skills/affinity-mcp/scripts/affinity-mcp-smoke.mjs --plugin-root "<absolute-plugin-root>" --config codex
```

把 `<absolute-plugin-root>` 换成实际安装目录的绝对路径；Claude Code / ZCode 用 `--config shared`。

这个脚本只核对本地清单、代理版本，读取 SDK preamble（即 SDK 说明），并完成服务握手与工具发现，不执行文档修改脚本，也不修改文档数据、系统设置或脚本库。测试通过只说明指定副本的底层服务接口能连上，不代表客户端界面已经加载这个副本。

</details>

<a id="隐私与条款"></a>

## 隐私与许可条款

插件默认只和本机的 Affinity 服务通信。不过，返回给 AI 客户端的文档数据、文本和预览，会由客户端发送给它配置的模型提供方。使用前请阅读[隐私政策](PRIVACY.zh-cn.md)与[服务条款](TERMS.zh-cn.md)。

本项目是由 [Paloexiz](https://github.com/Paloexiz) 维护的开源社区项目，不是 OpenAI、Z.ai、Anthropic、Canva 或 Affinity 的官方产品。有问题请提交到 [GitHub Issues](https://github.com/Paloexiz/Affinity-MCP/issues)（公开渠道，提交前请先去掉敏感信息）。

## 项目说明与致谢

开发渠道与版本管理规范见[版本说明](https://github.com/Paloexiz/Affinity-MCP/blob/fea92f526e93c36966f71544547c48e3c7322ce5/docs/versioning.md)。

插件目录结构参考 [Superpowers](https://github.com/obra/superpowers)；ZCode 通过它的[插件兼容能力](https://zcode.z.ai/cn/docs/plugin)复用这套结构；Claude Code 集成遵循官方[插件规范](https://code.claude.com/docs/en/plugins-reference)与[市场规范](https://code.claude.com/docs/en/plugin-marketplaces)。

代理实现和随包 Skill 改编自 [deba33/codex-plugins-by-deba33](https://github.com/deba33/codex-plugins-by-deba33)（源提交是 Paloexiz fork 里的 `9f2c2db`）。上游 MIT 许可和版权声明保留在 [LICENSE.upstream](LICENSE.upstream) 和 [NOTICE](NOTICE) 中；本项目采用 [MIT 许可证](LICENSE)。
