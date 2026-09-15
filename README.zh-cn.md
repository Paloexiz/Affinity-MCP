<p align="center">
  <img src="assets/affinity-mcp-icon.svg" width="112" height="112" alt="Affinity MCP">
</p>

# Affinity MCP

**语言选择：[English](README.md)  | 简体中文**

连接 **Codex、ZCode 和 Claude Code** 与 Affinity by Canva 本地 MCP 服务的独立插件。一个仓库只维护一个插件，清单、脚本、Skill 和资源直接放在根目录。

由 [Paloexiz](https://github.com/Paloexiz) 维护的社区项目，并非 OpenAI、Z.ai、Anthropic、Canva 或 Affinity 官方产品。

## Affinity by Canva 设置

打开 Affinity by Canva 的 **设置 → Model Context Protocol**。**Enable Affinity MCP** 是唯一必需的开关，默认地址为 `http://localhost:6767/sse`。

![Affinity by Canva 的 Model Context Protocol 设置面板](assets/affinity-mcp-settings.png)

图中是建议的配置：**Access files on your Desktop**、脚本面板相关开关和 **Save task hints to your device's local memory** 保持打开，这些能力才可用；**Access networks**、**Use Canva AI Studio features** 和 **Share task hints with Affinity** 属于可选项，是否打开由你按需要决定。

| 设置 | 建议值 | 作用 |
| --- | --- | --- |
| Enable Affinity MCP | 开（必需） | 提供本地 MCP 服务，Agent 通过它连接 Affinity by Canva。 |
| Access files on your Desktop | 开 | 允许脚本在任务需要时打开、编辑和保存桌面上的文件；桌面以外的路径会被拒绝，因此不等于整盘访问。 |
| Access networks | 默认关；脚本需要联网时再开 | 允许脚本通过 `network.js` 发起 HTTP 请求。与 MCP 传输相互独立，关闭时连接照常可用。 |
| Use saved scripts | 开 | 允许 Agent 读取脚本面板中已有的脚本。 |
| Save scripts to your scripting panel | 开 | 允许 Agent 把完成的脚本保存到脚本面板。 |
| Use Canva AI Studio features | 默认关；需要 Canva AI 时再开 | 允许脚本使用 Canva AI Studio 能力；其中 Premium 和 Ultra 级 AI 工具会消耗 Canva 套餐的月度 AI 额度。与 MCP 连接无关。 |
| Save task hints to your device's local memory | 开 | 在本地保存任务提示，让后续相似任务更快上手。 |
| Share task hints with Affinity | 可选，由你自行决定 | 分享匿名任务提示，帮助改进 Affinity 知识库。 |

不要只为了建立连接或编辑普通文档内容就打开网络和 Canva AI Studio 权限。

## 运行前提

- 已打开 **Enable Affinity MCP** 的 Affinity by Canva，与 Agent 在同一台电脑上运行。
- `PATH` 中以 `node` 可用的 Node.js **24.20 或更高**（建议 24.21 及以上）。插件代理用 `node` 连接 Affinity 本地服务；在 Windows 上，旧版本可能在进程退出时崩溃——观察到发生在客户端断开之后（libuv `UV_HANDLE_CLOSING` 断言、退出码 `3221226505`）。
- 支持插件的 Codex、ZCode 或 Claude Code。

## 安装

### Codex

在插件市场界面添加 `Paloexiz/Affinity-MCP`，然后安装 **Affinity MCP**。也可以执行：

```shell
codex plugin marketplace add Paloexiz/Affinity-MCP
codex plugin add affinity-mcp@affinity-mcp
```

Codex 读取 `.agents/plugins/marketplace.json`，唯一的插件来源为 `./`。启动配置直接写在 Codex 清单中，`cwd: "."` 由客户端解析为插件安装目录。

### ZCode

打开任意工作区，进入 **设置 → 插件 → 创建 → 添加插件市场**，填入 `Paloexiz/Affinity-MCP` 或本地仓库目录。在个人市场安装 **affinity-mcp**。Skill 和 MCP 服务会出现在各自的 Plugin 分组中。

ZCode 直接加载与 Claude Code 相同的 `.claude-plugin/` 清单、`.mcp.json` 和 Skill。共用市场索引保留 HTTPS SVG 图标和中文说明，更新后刷新市场即可。

如果同一客户端已经启用旧版 `affinity-mcp@codex-plugins-by-deba33`，启用新插件前先停用旧版，避免重复工具。

### Claude Code

添加当前仓库作为插件市场，然后安装：

```shell
claude plugin marketplace add https://github.com/Paloexiz/Affinity-MCP.git
claude plugin install affinity-mcp@affinity-mcp
```

Claude Code 读取 `.claude-plugin/plugin.json` 和单条 `.claude-plugin/marketplace.json`，自动加载共享 Skill 和根目录 `.mcp.json`，无需另行注册 MCP。本地开发可运行 `claude --plugin-dir /path/to/Affinity-MCP`，也可以将本地仓库路径添加为市场。

### 更新

在客户端刷新市场并更新或重新安装插件。Codex CLI 对应命令：

```shell
codex plugin marketplace upgrade affinity-mcp
codex plugin add affinity-mcp@affinity-mcp
```

现有任务仍使用旧 Skill 或工具配置时，打开新任务。Claude Code 依次运行 `claude plugin marketplace update affinity-mcp` 和 `claude plugin update affinity-mcp@affinity-mcp`，然后重启会话。发版时同步更新两份插件清单、Claude Code/ZCode 共用市场条目及代理报告的版本号。

## 使用与限制

首次可以让 Agent：**读取 Affinity SDK preamble，然后列出打开的文档，不做修改。** 编写脚本前读取当前 SDK 文档；修改后检查实际状态，涉及视觉内容时渲染核对。

代理转发 SDK 文档、脚本执行、渲染、脚本库及 SDK 提示等工具。它们是调用 Affinity SDK 的入口，没有自行实现每一个文档操作。

[Skill](skills/affinity-mcp/SKILL.md#supported-operations) 记录支持的操作与限制，仅覆盖列出的具体用例。

脚本超时或连接中断后可能已经执行，请先检查文档再决定是否重试。代理不会自动重放已提交的工具调用。离线返回的备用工具列表不能证明已连上 Affinity by Canva。

## 目前支持的功能

- [x] **连接 Affinity by Canva**：Codex、ZCode 和 Claude Code 可通过本地 MCP 调用 Affinity by Canva。
- [x] **查询 SDK 资料**：列出和读取 SDK 文档、搜索提示，并在授权后保存本地提示。
- [x] **执行与检查脚本**：在 Affinity by Canva 中运行 JavaScript，渲染当前画布或选区核对结果。
- [x] **文档与页面操作**：读取打开的文档和保存状态，新建多页文档，调整或切换画布，并撤销或重做修改。
- [x] **文字与排版**：创建文本框，写入和替换文字，并设置字体、字号、字距、对齐和缩进。
- [x] **矢量与画板**：创建、移动和删除图层、容器、形状与画板，并处理几何、边界、名称、锁定和可见性。
- [x] **选择与像素编辑**：选择图层或文字范围，读写位图像素，并使用矩形栅格选区处理像素。
- [x] **填充与描边**：使用纯色、渐变、影线、描边和已有矢量画笔。
- [x] **效果与图像处理**：使用已验证的图层阴影、透明度、混合模式、滤镜、调整和图像描摹。
- [x] **页边距与文档属性**：读取和修改已验证的页边距、单位和画布属性。
- [x] **保存与导出**：保存 Affinity 文档和打包副本，导出 PNG，并导出现有宏。
- [x] **切片导出配置**：读取、修改和应用已有切片的 PNG 尺寸配置。
- [x] **嵌入内容与图片框**：读取嵌入文档和图片框，并切换嵌入文档的页面或画板。
- [x] **文件、网络与对话框**：在授权后访问桌面文件、发起本地网络请求、使用计时器并显示 SDK 对话框。
- [x] **本地脚本库**：在授权后列出、读取和保存 Affinity by Canva 脚本。
- [x] **断线恢复**：连接恢复后继续处理新请求，不自动重复已经提交的调用。

## 不支持或尚未验证的功能

以下状态截至 **2026-09-11**，依据 Affinity by Canva **3.2.3.4646** 的实际验证；后续版本可能变化。

- [ ] **通过 SDK 关闭文档**：关闭接口当前未实现。
- [ ] **向现有文档插入或拼接页面**：SDK 没有可用入口，只能新建多页文档。
- [ ] **直接创建默认画笔对象**：RasterBrush 和 VectorBrush 的默认创建入口不可用；已有矢量画笔仍可读取和修改。
- [ ] **调整 RasterBrush 参数**：尚未取得可用的栅格画笔对象，透明度和间距未验证。
- [ ] **文本框链接和单个字形插入**：文本框之间的链接未验证，已测试的 CharGlyph 插入方式不可用；普通文字输入和替换可用。
- [ ] **完整的高级矢量操作**：曲线编辑、布尔运算及所有形状参数组合尚未验证。
- [ ] **完整的栅格选区操作**：选区相加、相减、相交及多边形选区尚未验证。
- [ ] **完整的切片导出流程**：不能完全通过 SDK 新建切片或 ExportConfig，也未验证直接按该配置导出。
- [ ] **同时指定导出宽高**：对应的 ExportScale 创建入口返回了错误的尺寸类型。
- [ ] **更多导出方式**：PDF、出血、多页导出及其它格式或预设尚未验证。
- [ ] **创建或替换图片框内容**：目前只验证了读取已有图片框。
- [ ] **宏录制与回放**：目前只验证了导出现有宏。
- [ ] **全部效果和图像处理参数**：当前只验证了部分滤镜、调整、填充、描边和图层效果。
- [ ] **完整的网络能力**：公网、TLS 和异步网络尚未验证；本地同步请求可用。
- [ ] **异步文件复制**：已测试的异步复制方式不可用；同步桌面文件操作及部分异步读取可用。
- [ ] **Canva AI 功能**：一次生成命令在执行前被拒绝，其余 AI 功能未验证。
- [ ] **向 Affinity by Canva 上报 SDK 问题**：尚未执行，且每次都需要用户明确授权。

没有列出的 SDK 操作仍视为尚未验证；受权限控制的功能需先在 Affinity by Canva 中授权。

## 验证

```shell
node scripts/affinity-mcp-proxy.test.mjs
```

检查覆盖两种 stdio 帧格式、分页、文字与图片转发、HTTP 错误、断线不重放、重连、EOF 退出、版本一致性，以及包含空格和中文路径下的 Codex 和 Claude Code/ZCode 共用启动配置。测试使用本地模拟服务，不修改 Affinity by Canva 文档。

## 结构依据与致谢

根目录布局参考 [Superpowers](https://github.com/obra/superpowers) 及其 [source 为 ./ 的单条市场索引](https://github.com/obra/superpowers/blob/main/.claude-plugin/marketplace.json)。ZCode 通过其[文档声明的 Claude Code 插件兼容能力](https://zcode.z.ai/cn/docs/plugin)复用该格式。Claude Code 入口参考其[插件规范](https://code.claude.com/docs/en/plugins-reference)和[市场规范](https://code.claude.com/docs/en/plugin-marketplaces)。

代理和 Skill 来自 [deba33/codex-plugins-by-deba33](https://github.com/deba33/codex-plugins-by-deba33)，迁移基线是 Paloexiz fork 的 `9f2c2db`，包含此前的代理修复与 SDK 实测指引。原 MIT 许可及署名保留在 [LICENSE.upstream](LICENSE.upstream) 和 [NOTICE](NOTICE)，本仓库使用 [MIT](LICENSE)。
