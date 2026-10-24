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

扫描直接遍历 `docs/`，不受 `.gitignore` 排除规则影响。检查本机绝对路径、会话类标识、UUID、指向内部证据的链接、常见邮箱/电话/密钥格式，以及可识别的地理时区、本地 UTC/GMT 偏移和带非零偏移的时间戳；日期和统一 UTC 基准允许保留，示例保留域名可用。符号链接（包括悬空链接）和未支持的文档格式会被提示处理，不能利用它们跳过检查。输出只有相对文件位置、行号和规则名，不打印命中的敏感原文。此扫描不检查 Git 提交/tag 元数据、历史树或远端缓存，不能替代历史泄漏审计。

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

时区隐私回归用合成地理区名、UTC/GMT 本地偏移与带偏移时间戳验证拒绝注入且不回显，另验证日期、UTC 和零偏移时间戳正常通过。这里只核对可识别格式，个人环境信息仍需人工语义检查。

直接 CLI 另验证正常检查的 JSON 输出、隐私发现及未知 mode 的非零退出；Windows 同时使用普通和 namespaced 入口路径。模块导入只输出测试 sentinel，不读取 hook stdin 或生成状态，原有 PowerShell/POSIX 启动器回归继续保留。[测试实现](../scripts/docs-hooks.test.mjs)。

[仓库 CI](../.github/workflows/docs-hooks.yml)在每次 develop push、目标为 develop 的 PR opened/synchronize/reopened/edited/ready_for_review 时执行，不使用路径过滤。PR 改目标或从草稿转为就绪也重新检查。默认及普通 CI 只有 `contents: read`；发布准备、安装和控制摘要局部增加 `actions: read`，需要核对 check 的发布摘要及执行任务另有 `checks: read`。checkout 不持久化凭据，三个官方 Actions 固定完整提交 SHA。PR 和普通 CI 不引用生产 Environment、发布密钥或生产写入步骤。

三平台固定 Node `24.22.1`，Linux 另以 `24.20.0` 检查最低版本兼容；矩阵不因一个平台失败取消其余平台。普通测试 job 的 Windows 超时预算为90分钟、macOS为30分钟、Linux为15分钟；旧源码恢复重验的 Windows 预算为90分钟、macOS为30分钟、Linux为20分钟。各环境记录 Node、Git、runner 镜像身份、事件/workflow/实际 checkout SHA、run 与 attempt。Git 必须为 2.45+。运行静态版本/隐私检查及代理、版本、hooks、inspection-preview 四套原有回归，并加入交付历史、链接、CI 事件/汇总、生产 ZIP/manifest/实际包内模拟，以及[持久控制协议回归](../scripts/release/control.test.mjs)。控制回归只使用真实临时 Git 与本机 HTTP 模拟 API，不访问 GitHub；代理和包内回归只连接本地模拟服务，不访问真实 Affinity。归档回归使用合成正式候选，不能替代具体发布候选同一 ZIP 的三平台验收。Windows hooks 夹具实际启动 PowerShell，macOS/Linux 启动 `/bin/sh`；最低 Node 的 Linux 结果不能替代另外两平台最低版本验收。

[CI 入口](../scripts/ci.mjs)核对事件和 checkout。PR 的 merge SHA 用于集成测试，merge 的两个父提交须等于事件 base/head；版本历史单独检查 head。策略 job 完整 checkout 后显式 fetch base/head 和 main，启用候选转换时另取得固定控制根及完整控制 ref；fork head 也须存在，全部所需对象缺失即失败，checker 不按需联网。身份、基准和 workflow/checker 变更写入日志与 job summary。模式先按版本形态确定，再完整检查普通批次、转正、日期修订或候选撤回，不在失败后降级尝试其它类型。候选转换只在 `RELEASE_ENABLED=true` 且有固定控制根时开放；配置必须在真实平台验收后启用，静态 stable 通过不能绕过这一要求。真实临时 Git 与本机 HTTP 回归不等于平台保护已生效。

策略 job 还核对[本地链接与生产范围](../scripts/check-links.mjs)。启用前须由获授权的维护者关闭 merge/rebase，只保留 squash，并读回设置；develop 还须配置线性历史、最新分支和 required check 规则。GitHub 的[仓库 API](https://docs.github.com/en/rest/repos/repos#get-a-repository)要求 `contents:write` 才返回合并设置字段，因此普通只读 CI 不承担该项配置验收，也不因此增加写权限。PR 标题和提交消息中的 skip 标记均拒绝；最终 squash 消息仍可能被人工修改，完全跳过的运行无法自报缺席。发布前的准确 push 证据要求由后续发布流程承担，不能由手动运行替代。

汇总 job 的 `name` 字面值为 `Repository checks / required`，使用 `always()` 并明确要求 `test` 矩阵和 `policy` 全部 success；failure、cancelled、skipped、缺项均非零退出。汇总不 checkout 候选源码，不等待人工审批。设置 required check 时必须读回真实 check-run 名称与 GitHub Actions 来源，并通过真实 PR 验证失败阻止合并；配置文件和本地汇总测试不构成平台保护已生效的证据。

普通测试列表另包含[发布证据与正常交付回归](../scripts/release/publication.test.mjs)：仅本机 HTTP 和临时 Git，验证准确原 push attempt/ref 制品、只读保护预检、审批交接身份、receipt/生产提交绑定以及 main/tag/draft/附件/公开的顺序与故障停止。App 测试仅用临时合成 RSA 密钥及假 token；不读取生产凭据，不访问真实 GitHub。push 的策略任务生成规范 `push-ref.json`，准确 artifact ID/digest 传给发布准备；准备只等待必需 CI 汇总，不等待整个包含审批的 run 完成。编排存在不能证明已启用或通过真实平台验收。

[补缺恢复回归](../scripts/release/recovery.test.mjs)同样只运行本机 HTTP/Git：在 main、tag、草稿、部分附件等状态重新读取，只补缺项；同时验证原 CI 可用性、准确 P/receipt 与新验证/审查身份、冲突和未知停止。只读报告另覆盖 tag/Release/附件及最终控制重读失败，保留先前目标和部分附件的观察，明确冲突并断言零新写入。它使用合成 job/check/artifact 记录检查交接契约，不能冒充真实旧源码的三平台重验。无凭据恢复检查、同一 ZIP 安装 jobs、production 批准和实际恢复入口仍由后续编排与平台验收负责。

`workflow_dispatch` 的 `ci` 模式用于只读重验，必须选择 develop 并提供准确前一开发提交 `base_sha`；其余为 `publish`、`recover`、`retire-candidate` 和 `control-recover`，各自严格限定必需及禁止字段，并要求预期工具 SHA 和唯一入口标识。手动 CI 不冒充准确 push 证据。发布/控制 dispatch 的普通 CI 任务被有意跳过，普通 required 因依赖未成功而失败；这些模式通过自己的准确证据及针对性审批前进，不消费这一失败的普通汇总。guard 不依赖安装包或被它阻塞的 PR。入口及输入表见[版本说明](versioning.md#受控工作流入口)。

准备步骤只在 push 模式解析本次 policy 输出的 ref 制品。手动首次发布从显式输入取得原 push 的准确证据，恢复按既有 receipt 判定，不解析被跳过任务的空输出。首次发布在准备阶段即要求 source 仍为 develop tip，摘要和写入前继续重验；已交付恢复允许旧 source。准备后，三个独立安装任务按同一个 artifact ID/digest 下载，实际验证 ZIP 和独立生产树，再各自上传安装回执；不依赖矩阵的同名 output。恢复的四个测试任务另 checkout 输入的旧 C，当前受审工具检查准确 HEAD 并枚举旧源码的全部适用测试，先执行版本、隐私和链接检查，再执行所有根 scripts 下的测试及独立代理回归。执行旧代码的子进程剔除 Actions 运行凭据、读 token 和发布环境变量；任务本身没有生产密钥。恢复策略沿原生产父检查历史及持久绑定，独立汇总要求测试和策略全部成功；完成后才生成新验证附件。

发布摘要保存同运行 handoff/digest、独审记录、完整生产差异及双语 CHANGELOG；control 摘要仅保存具体撤销/恢复事实、工具审查和永久后果。三个写入任务只在摘要成功后引用预建 `production`，共享固定 job concurrency group、`queue: max`、`cancel-in-progress: false`；普通 CI 不占组。批准后固定 checkout 本次 workflow/tool SHA，发布私钥只提供给执行步骤，旧 source 不决定持钥代码。实际批准核对通过后，先保存绑定交接 digest 的批准记录，再申请 App token；保存失败即停止。执行成功或捕获后续失败时，结果保留本进程已取得的批准记录，不能从旧文件继承批准。runner 消失或强制取消可能使尾部审计上传缺失，不能据此推断没有写入，应查持久控制历史。

原 ref、包、安装回执、恢复验证及审计制品设置 30 天保留；仓库/组织上限和真实过期状态须另核对。发布工作流的本地运行资料和恢复源码副本位于 `.scratch/release/materials/`，上传步骤与工具使用同一路径。审计附件与可复现三项发布附件分离。维护者应在期限前导出准确 run/attempt 的审查、摘要、批准和结果；仅有 digest 不能重建原报告。job output 超过固定大小限制会停止，不截断交接。队列语义依据[GitHub 官方说明](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)；静态工具未识别新字段时应单独核对具体差异，不能忽略其它诊断或声称平台调度已验证。

[链接检查器](../scripts/check-links.mjs)覆盖当前仓库的 Markdown 内联/引用式链接、HTML href/src、标题和显式锚点、URL 编码路径与 Git 忽略规则，拒绝缺失、越界及符号链接。注释和代码示例不提供真实锚点或生产清单，公开允许清单章节必须唯一。行内代码只支持同一行内等长反引号配对；未配对或跨行写法明确失败，应改用围栏代码块，不能让跨段匹配吞掉后续链接。静态检查与归档生成共用生产清单结构、来源和转换校验，拒绝多余字段或错误的 README 转换；机器清单和公开允许清单须集合一致，安装清单的路径与随包文档引用须落入允许集合；仅根 README 的 `docs/versioning.md` 链接可等待规定的生产转换。生产忽略模板另由必需测试核对期望字节和实际 Git 忽略语义：允许清单内文件及环境示例须保留，环境配置和运行残留须忽略；模板变化需同步审查期望夹具。它不访问外部 URL，不解析任意 Markdown 扩展或 JavaScript 动态路径，也不替代真正生产 ZIP 的解包/安装验收。隐私检查与人工语义复核继续分别执行。

正常发布与恢复的证据核对还要求三份独立安装回执：每份绑定准确 job、执行身份、实际消费的 artifact ID/传输 digest 以及 ZIP/manifest/tree。离线负例覆盖绿色 jobs 搭配另一份包、相同包重新上传为另一个 artifact、回执缺失及身份替换，不能只凭成功任务名称通过。正常发布与恢复另在公开意图已经持久化后模拟附件被移除，检查草稿保持未公开且没有发送公开请求；这验证最终检查的执行顺序，不模拟平台原子发布。回执的真实生成与传递须在后续 workflow 编排中验收。

历史 CI 回归另将可读汇总 job/check ID 的矛盾与 check 404/410 组合，要求身份冲突先失败；身份相符而 check 真正不可取得的对照仍保留重验分类。它只验证读取和判定顺序，不把合成记录当作平台删除原因。

各平台的通过结论必须来自对应环境的真实结果。本地测试、YAML、hook 信任状态和规则存在都不能替代 GitHub 事件触发、required check 或宿主生命周期验收；本机结果与启用记录按[维护规则](maintaining.md)仅保存在本地。
