# 仓库文档 Hooks

这些 hooks 用于维护本仓库的 Codex 任务：操作前提供文档上下文，实现变更后要求复核文档，持续检查 `docs/` 中可识别的隐私信息。它们不作为 Affinity MCP 插件的工具分发给终端用户。

## 配置和运行前提

- 项目配置：[`.codex/hooks.json`](../.codex/hooks.json)。实现：[docs-hooks.mjs](../scripts/docs-hooks.mjs)。回归：[docs-hooks.test.mjs](../scripts/docs-hooks.test.mjs)。
- Windows、macOS、Linux 共用一个 Node.js 实现，使用仓库已有 Node.js 24.20+ 运行环境及 Git；无新增第三方依赖。Windows 的 `commandWindows` 使用 PowerShell 并显式设置 UTF-8；macOS/Linux 的 `command` 使用 POSIX shell。从仓库子目录启动也通过 Git 根目录定位脚本；配置不包含个人绝对路径。
- 各平台将 `docs/` 中的公共技术文档与 `AGENTS.md` 随仓库维护；本地专用说明和内部资料由忽略规则排除。公共文档不得引用被忽略的内容，具体约束见 [维护规则](maintaining.md)。入口缺失时 hook 会提示检查失败，不会声称已读。测试使用合成文档，个人资料不进入仓库或 CI。
- 这是 Codex 项目级配置，不修改用户全局设置，也不假定 Claude Code/ZCode 会读取它。其他客户端的自动执行未配置、未验证。
- 脚本通过 Node 的 `import.meta.main` 判断直接入口，不按 argv 与模块路径字符串比较；等价入口路径会执行 CLI，导入模块只提供函数。运行前提仍是 Node.js 24.20+。[Node.js 24 入口标志](https://nodejs.org/docs/latest-v24.x/api/esm.html#importmetamain)。
- Codex 要求项目配置层受信任，并在 `/hooks` 或 hooks 管理界面审阅、信任具体 hook 定义。更改定义后可能需要重新信任；写好配置、脚本测试通过都不等于当前会话已启用。依据：[官方 Hooks 文档](https://developers.openai.com/codex/hooks)。

## 执行流程

| 事件 | 动作 | 防循环行为 |
| --- | --- | --- |
| `SessionStart` | 隐私检查通过后，将文档入口、维护规则、领域说明、架构、SDK 索引和本页正文注入上下文；恢复/压缩也适用 | 只读取文档，不自动修改文档 |
| `UserPromptSubmit` | 建立本轮实际文件内容基线，并提供上述文档正文 | 同一轮的追加消息不重置基线 |
| `PreToolUse` | 若开始事件缺失，在第一次工具执行前补基线与文档上下文 | 同一轮只注入一次；不解析命令文本猜测是否写文件 |
| `PostToolUse` | 比较实际文件内容；有新实现变化时提醒相关文档；直接扫描包含被 Git 忽略文件的 `docs/` | 同一实现状态只提醒一次；文档修改不形成新的同步待办 |
| `Stop` | 正文未提供、隐私问题或有效基线下的源码未复核时，要求继续处理一次；仅历史基线缺口时给人工核验提示 | 每轮最多自动续跑一次，也遵守 `stop_hook_active`；纯历史提示不消耗续跑额度，不无限续跑 |

`PreToolUse`/`PostToolUse` 匹配所有支持的本地工具路径，所以 shell、`apply_patch` 和 MCP 替换都能通过文件内容比较识别。并非所有宿主工具都必然发出 hook 事件；结束检查会再次扫描。宿主覆盖和 Stop 输出语义见[官方 Hooks 说明](https://developers.openai.com/codex/hooks)。

文档正文注入上限为 60,000 字符；超过上限或入口缺失会明确告警，不把截断内容标成已读取。实际理解内容和判断更新是否准确仍由 Agent 完成，hooks 不能证明模型真正理解了文档。

在 `UserPromptSubmit`/`PreToolUse` 已成功取得文件快照之后，正文读取或总字符上限检查异常只中断本次注入：保留真实前置基线，正文仍标记为未提供，并在后续前置事件重试。固定告警不包含异常原文、正文或本机路径。快照、Git 清单、锁、状态读取和持久化本身失败仍明确报告不完整，不承诺保存成功；`SessionStart` 不建立轮次基线。非法 UTF-8 和隐私发现走拒绝注入的检查路径，不等同于正文异常导致基线丢失。

仅支持正文注入的事件设置 `additionalContextLimit`；`Stop` 返回续跑理由，不配置该无效字段。

隐私警告不算完成正文注入。清理后，下一次 `UserPromptSubmit`/`PreToolUse` 会重试；正文尚未成功提供时，结束检查也会提示缺口，并遵守一次续跑限额。

## 如何完成文档同步

检查以本轮开始时的文件内容为基线，已有未提交改动不会自动归为本轮新增工作。检测范围包括 Git 跟踪文件及未被忽略的新文件；生成缓存、临时资料和文档文件排除在“实现变更”之外。新增、删除和改名均通过内容清单差异发现。

| 实现变化 | 默认需要核对的文档 |
| --- | --- |
| `.codex/`、`scripts/docs-hooks*`、hooks 的 CI 配置 | 本页 |
| `skills/` 下的非文档实现文件 | SDK 索引或验证方法 |
| `skills/affinity-mcp/scripts/` 中的 `affinity-mcp-proxy.mjs`、`affinity-mcp-smoke.mjs` | 架构说明；优先于通用 Skill 分类 |
| `.gitignore`、`.gitattributes` | 文档维护说明 |
| 其他实现、配置、资源 | 架构说明 |

Markdown 等文档的单独编辑不要求再修改另一份文档。对随包 Skill 的文字变化，Agent 仍需按[维护规则](maintaining.md)判断关联页面和链接是否需要更新；不会通过机械链式触发强迫修改。

实现变化后，先核对并更新对应文档，再运行 hook 提示中的命令；提示会给出本轮匿名 ticket：

```shell
node scripts/docs-hooks.mjs review --ticket <ticket> --reason "说明本次实现变化，以及核对或更新了哪些文档"
```

工具检查相关文档是否相对基线有更新，并把复核绑定到当前实现内容。后续实现再次变化，旧复核失效。文档继续校对不会再次要求复核。只有测试注释等确实不影响文档时，可用 `--no-doc-change` 并具体说明理由；没有理由或理由过短会被拒绝。复核记录是明确的工程判断，不是语义正确性证明。

原始输入缺少轮次身份、第一次收到的事件已在操作后、Git/状态文件不可读时，会明确报告无法完整验证；不会把当时的快照冒充操作前基线。

首次成功建档已经晚于操作时，缺失的历史基线无法由后续正文注入或人工检查补回。该票据不能执行自动 `review`；后续源码变化只提示人工核对，列出的文件仅覆盖晚到快照之后观察到的变化，不代表本轮全部变更。Agent 应检查全部实际变更及相关文档，并在最终答复说明自动验证不完整。只有此类历史缺口时，Stop 不自动续跑；正文或隐私问题仍按一次续跑上限处理。

启动器的 Git 根目录定位和脚本内的文件清单查询都捕获错误输出，失败只返回固定提示；不把可能含个人路径的 Git 原始错误转发给宿主，也不在根目录定位失败后继续启动 Node。两种 shell 入口都适用。

启动器同样捕获 Node 的输出：脚本缺失、语法错误或异常退出时丢弃原始输出并返回固定 JSON 提示；成功时才转发 hook 的 JSON。这样在脚本自身的错误处理尚未加载时，也不会输出本机路径或异常堆栈。

## 文档隐私边界

`docs/` 仅保存通用技术文档。个人工作内容、真实会话/调用标识、机器路径、联系信息、密钥、使用统计和原始聊天不得进入这里。实验仅保留构建、平台、合成样本、操作和后置结果；优先链接[脱敏技术证据](sdk/evidence/2026-10-08.md)。

扫描直接遍历 `docs/`，不受 `.gitignore` 排除规则影响。检查本机绝对路径、会话类标识、UUID、指向内部证据的链接、常见邮箱/电话/密钥格式；示例保留域名可用。符号链接（包括悬空链接）和未支持的文档格式会被提示处理，不能利用它们跳过检查。输出只有相对文件位置、行号和规则名，不打印命中的敏感原文。

内部文件引用按可识别路径检查，覆盖内联/引用式Markdown、图片、HTML资源和裸路径，不依赖目标文件存在。引号或Markdown尖括号包裹的单路径可包含空白；反引号中的无空白路径保持完整。反引号片段若以内部路径开头且含空白，无法可靠区分命令和单路径，按歧义引用保守提示；带空白的单目录须另用内层引号或尖括号明确边界。其他片段继续扫描内层包裹路径与裸路径。裸路径区分内部配对括号与路径前的外围括号，常见正文标点作为边界；字面标点路径使用完整包裹形式。目录用途说明须保留末尾斜杠；未以斜杠结尾的内部路径按具体文件保守处理，包括无扩展名文件。查询与片段不改变判断，占位目录不会豁免同一行的其他真实文件引用。JSONL和会话数据库文件名也会被提示处理；这不是完整Markdown或命令解析器，也不解码任意编码链接。

正则扫描不能识别所有个人姓名、业务事实或经过改写的敏感内容。Agent 必须另做语义检查，不能把零命中写成隐私的绝对保证。hooks 不读取本地内部资料或聊天记录，也不上传数据。

## 本地状态与故障处理

状态写入 `.scratch/docs-hooks/`，仅含匿名 ticket、文件 hash、相对路径、复核说明和时间，不保存原始会话身份、工具参数、输出或文档正文。每个 ticket 加文件锁并原子写入，避免并发工具回包覆盖状态。该目录用于任务恢复与复核，不进入文档或发布物。

如果进程被强制终止并留下锁，后续等待最多 5 秒便明确告警。确认该任务和 hooks 均未运行后，才能清理对应过期状态/锁；不要在运行中删除。状态无法写入时不伪装为已检查。

Stop 只为仍可处理的正文、隐私或有效基线文档复核问题使用一次续跑额度；无法补回的历史基线限制保留人工告警。若仍有隐私问题、未复核变更或基线缺口，Agent 必须在最终答复说明未完成项。它不是强制保密或不可绕过的安全边界，不自动提交、推送或修改用户文件。

## 验证

```shell
node --test scripts/docs-hooks.test.mjs
node scripts/docs-hooks.mjs check
```

测试在可清理的临时 Git 仓库验证：开始事件、实际文件变更、已有脏状态、仅文档修改、删除/新增、复核失效、显式无更新理由、Stop 限额、忽略目录内隐私、悬空文档链接、输出不泄漏、以及真实启动命令在含空格/中文的子目录运行。测试要能创建临时 Git 元数据；受限沙箱拒绝时需在允许的本地测试环境运行，不应改动仓库或全局 Git 权限。

生命周期组合覆盖晚到事件后补正文与人工收尾、缺基线后源码变化及混合隐私问题、正文异常后的原快照保存与恢复复核、追加提示不重置前态或续跑额度、独立新轮次，以及真实启动器前置脚本缺失后恢复。启动器恢复时只能记录后来事件，不能据此补造更早基线。状态损坏、锁忙和持久化失败另作失败边界检查；这些合成序列不证明宿主实际加载、恢复或压缩事件已经验收。

直接 CLI 另验证正常检查的 JSON 输出、隐私发现及未知 mode 的非零退出；Windows 同时使用普通和 namespaced 入口路径。模块导入只输出测试 sentinel，不读取 hook stdin 或生成状态，原有 PowerShell/POSIX 启动器回归继续保留。[测试实现](../scripts/docs-hooks.test.mjs)。

[三平台回归配置](../.github/workflows/docs-hooks.yml)在 `develop` 推送或目标为 `develop` 的 PR 中，相关文档、版本清单、CHANGELOG、忽略规则、hooks、版本检查器、代理测试或两个 Skill 运行脚本发生变化时触发；分支和路径过滤须同时满足。[GitHub 触发规则](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)将 PR 的分支过滤应用于目标分支。生产 `main` 不包含维护 workflow，开发检查由 `develop` 的 push/PR 承担。

配置保留 `workflow_dispatch`，但[手动触发](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow?tool=cli)有默认分支存在 workflow 的前提；`--ref develop` 只选择运行分支，不承诺绕过该前提。每个平台先检查实际仓库 `docs/` 的隐私，再运行合成夹具回归：Windows 实际启动 PowerShell，macOS/Linux 实际启动 `/bin/sh`，均覆盖中文/空格路径、子目录启动和纯 JSON 输出。测试临时目录先解析真实路径，兼容 macOS 的临时目录符号链接。配置使用 GitHub 官方的 [checkout](https://github.com/actions/checkout)、[setup-node](https://github.com/actions/setup-node) 与 [runner 矩阵](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job)；只申请仓库读取权限，本机忽略资料不进入 CI。

同一 workflow 另以显式 `--channel development` 运行版本静态检查和校验器回归，不依赖 checkout 的分支名，也不自动取得生产基准。静态模式不调用 Git；版本增量及其回归要求 Git 2.45+，以 `--no-lazy-fetch` 禁止部分克隆按需下载缺失对象，缺对象或旧 Git 不支持该选项时明确失败。回归只在临时仓库通过本地 `file://` 克隆验证这个边界。交付前的版本增量核验使用维护者已确认的 Git 提交单独运行，见[版本检查](versioning.md#两类检查)。这些命令不改变 hooks 生命周期、信任或启用状态。

各平台的通过结论必须来自对应环境的实际运行结果，CI 配置存在不代表测试已通过。启用后还需观察真实生命周期是否触发；手动模拟和 hook 信任状态都不能替代此项检查。本机执行结果与启用记录按[维护规则](maintaining.md)仅在本机保存。
