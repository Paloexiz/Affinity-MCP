# 版本与变更日志

本页定义 Affinity MCP 的开发批次、正式版本和交付检查。[英文更新日志](../CHANGELOG.md)与[中文更新日志](../CHANGELOG.zh-cn.md)同步记录使用者可理解的变化；插件版本、MCP 协议日期、Affinity 应用构建及 SDK 历史观察分别维护。

## 版本和渠道

采用 [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) 的版本格式与优先级，并限制为以下两种仓库格式，不使用前导 `v`、前导零、构建元数据或其他预发布标签：

| 分支 / 渠道 | 格式 | 含义 |
| --- | --- | --- |
| `main` / 正式 | `MAJOR.MINOR.PATCH` | 正式交付版本，只包含用户安装树及根中英文 CHANGELOG；实际交付另行核验 |
| `develop` / 开发与发布准备 | 日常使用 `MAJOR.MINOR.PATCH-dev.N`；正式交付时转为 `MAJOR.MINOR.PATCH` | `N` 从 1 起，按开发交付批次递增；正式版本先在本分支提交并推送，再同步到 `main` |

例如，正式基准为 `0.4.0` 时，下一个修复目标可依次为 `0.4.1-dev.1`、`0.4.1-dev.2`；正式交付准备时先在 `develop` 将版本转为 `0.4.1`，完成检查、审查、提交和推送，再把该提交的生产内容同步到 `main`。稳定格式本身不是发布凭据。SemVer 的顺序是 `0.4.0 < 0.4.1-dev.1 < 0.4.1-dev.2 < 0.4.1`；数字序号按数值比较，`dev.10` 高于 `dev.9`。这说明源码版本优先级，不证明某个已安装宿主的跨渠道更新行为。

开发目标的 core 由相对正式基准的**累计产品交付影响**决定：兼容修复递增 PATCH，兼容的新能力递增 MINOR；达到 `1.0.0` 后，不兼容的公开契约变化递增 MAJOR。`0.y.z` 仍处于初始开发阶段，本仓库在这个阶段将不兼容变化放在下一 MINOR，并明确记录迁移影响；只有准备承诺稳定公开契约时才进入 `1.0.0`。公开契约包括插件标识与安装布局、启动配置与环境变量、代理对客户端的消息和错误行为，以及随包 Skill 承诺的工作方式；Affinity 外部 SDK 的全部能力不属于本插件的版本承诺。

默认只选择正式基准的下一 PATCH、下一 MINOR 或下一 MAJOR，低位归零。连续开发批次的 `N` 必须加 1；目标 core 上调时重置为 `dev.1`。这是本仓库便于审查的递增约定，**SemVer 本身不要求历史版本号连续**。校验器只能检查这种数值约束，影响级别仍由维护者判断。

正式交付后，`develop` 保留该正式版本；下一批开发开始时，再以已核对的正式基准选择下一目标并从 `dev.1` 开始，不在同步 `main` 时预先创建下一批开发版本。

纯文档、测试、CI、hooks 或仓库维护工具的交付也递增开发 `dev.N`，以识别开发快照；这些变化本身不要求正式升版。未获正式交付授权时只维护开发渠道；用户明确要求将开发目标转为正式版时，先在 `develop` 转正并推送，再同步 `main` 的正式版本及生产内容。已有下一目标可以持续承载维护批次，不能因维护修改自行发起正式发布。

选择“下一目标 core + dev.N”，便于看出候选属于哪个正式目标，并保持候选与正式版本的 SemVer 关系。固定在低 core 上无限增加开发序号会长期低于后来正式版，使渠道切换的版本判断更难解释，因此不采用。开发和正式仍沿用相同插件标识与市场名称；这不是两个可同时安装的独立产品。

<a id="production-content"></a>
## main 分支保留范围

`main` 是完整 Plugin 的生产分发树，按下表的**具体文件允许清单**同步。目录名称不代表其中所有文件都可发布；尤其不能整体复制 `assets/` 或 `skills/`。新增运行依赖或用户资料前，先在 `develop` 更新本节并核对其用途及引用，再进入正式交付流程。

| 用途 | 允许保留的文件 |
| --- | --- |
| Plugin 与市场入口 | `.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`.mcp.json` |
| Agent 使用入口与 references | `skills/affinity-mcp/SKILL.md`；`skills/affinity-mcp/references/` 下的 `sdk-verified.md`、`scripting-pitfalls.md`、`page-geometry.md`、`inspection-preview.md` |
| 随包运行工具 | `skills/affinity-mcp/scripts/` 下的 `affinity-mcp-proxy.mjs`、`affinity-mcp-smoke.mjs`、`inspection-preview.mjs` |
| 用户说明与版本摘要 | 根目录的 `README.md`、`README.zh-cn.md`、`CHANGELOG.md`、`CHANGELOG.zh-cn.md`、`PRIVACY.md`、`PRIVACY.zh-cn.md`、`TERMS.md`、`TERMS.zh-cn.md` |
| 许可与署名 | 根目录的 `LICENSE`、`LICENSE.upstream`、`NOTICE` |
| 安装及用户说明直接使用的资源 | `assets/affinity-mcp-icon.svg`、`assets/affinity-mcp-settings.png` |
| 生产 Git 规则 | 根目录的 `.gitattributes`、生产专用 `.gitignore`；不复制开发工具配置 |

`docs/`、根 `scripts/`、项目 hooks/CI 配置、`AGENTS.md`、测试、夹具和验证证据仅留在 `develop`。`assets/sdk-evidence/` 即使是公开脱敏合成资料，也属于开发证据，不进入 `main`；“可公开”“被 Git 跟踪”或“位于 assets”都不是分发依据。缓存、备份、原始记录、依赖安装目录及本地 Agent 状态也不进入生产树。随包 Skill/references 是 Agent 实际使用的资料，与这些开发文档分别判断。

所有文档、源码和发布范围修改先在 `develop` 完成。生产候选只从已核对的开发提交提取允许文件，并保留规定的生产 README 链接适配及 Git 规则；不在 `main` 编写开发文档或另行修正功能。

当前中英文 README 指向 `docs/versioning.md` 的相对链接，在生产副本中替换为指向本次已核对开发提交中同一文件的 HTTPS 固定链接；`develop` 保留原相对链接。不能为了保留相对链接而把 `docs/` 复制进生产树。机器清单见 [production-files.json](../scripts/release/production-files.json)，生产忽略规则使用[独立模板](../scripts/release/production.gitignore)。[链接检查器](../scripts/check-links.mjs)对照本表核对集合、来源及安装引用；它不生成生产包，也不证明现有 main 已符合此清单。

同步验收须同时满足：

1. 使用 `git ls-tree -r --name-only <production-commit>` 核对**完整文件集合**与上表一致；提交前另核对候选工作树及新增文件，不能只看本次新增文件或认为 `.gitignore` 会移除已经跟踪的文件。
2. 清除生产候选中历史遗留的排除项，并核对删除范围只涉及开发资料。开发分支的文档、夹具及测试引用保持完整。
3. 在仅含允许文件的生产候选上，核对清单、运行资源、用户文档和 Skill/references 的全部本地引用均能解析；不得依赖 `docs/`、测试夹具或开发 checkout 才能安装、阅读或运行。安装副本也按同一清单核对。
4. tag、GitHub Release 及其附件只能绑定通过上述验收的生产提交；开发分支完整源码压缩包不充当生产安装包。记录允许清单不表示已有远端生产树已完成清理。

## 发布归档的生成与核对

[发布 CLI](../scripts/release.mjs)的 `prepare`、`verify`、`verify-install` 只做本地准备、验证与安装模拟；控制模式另见[控制记录与恢复](architecture.md#发布控制记录与故障恢复)，实际平台配置与生产启用须单独完成验收。安装和更新仍从 main 的 marketplace 进行，ZIP 不构成新的安装渠道；用户下载方法见[中文 README](../README.zh-cn.md#下载发布归档)。生成前须取得并确认 source、原生产 base 的完整 Git 对象，候选必须为通过静态检查的正式格式，且相对 base 是下一正式目标。工具不转换工作树版本，也不代表已获正式发布授权。

```shell
node scripts/release.mjs prepare --source-sha <source-commit> --base-sha <production-base> --output-dir <new-output-directory>
node scripts/release.mjs verify --source-sha <source-commit> --base-sha <production-base> --bundle-dir <bundle-directory> --tree-sha <expected-tree> --archive-sha256 <expected-zip-hash> --manifest-sha256 <expected-manifest-hash>
node scripts/release.mjs verify-install --source-sha <source-commit> --base-sha <production-base> --bundle-dir <bundle-directory> --tree-sha <expected-tree> --archive-sha256 <expected-zip-hash> --manifest-sha256 <expected-manifest-hash>
node --test scripts/release/archive.test.mjs scripts/release/production.test.mjs
```

可用 `--root` 指定包含已确认 Git 对象的仓库。输出目录的父目录须存在，目标目录必须尚不存在；不覆盖旧附件。prepare 输出候选身份、三个校验值及生产文件差异；后两命令的期望值来自独立保存的 prepare 结果或已批准交接，不能从待验证附件中抄取后当作批准依据。verify-install 执行包内代码，只能在无生产凭据的验证阶段运行。

配方 v1 固定为 28 个允许文件、Git mode `100644`、UTF-8 路径字节序、无压缩 ZIP STORE、DOS 时间 1980-01-01 00:00:00，不写目录项、注释或 extra fields。输入使用 Git blob 原始字节，不转换换行；拒绝 symlink/submodule、非可移植路径、重复/大小写或文件目录冲突及 ZIP64。README 只转换指定 versioning 链接；历史 Validation 删除仅匹配已知旧提交和对应输入 hash，不能据标题删除当前合法段落。CHANGELOG 与 `.gitattributes` 原样复制，`.gitignore` 来自生产模板。实现采用 [Node 内建 CRC32](https://nodejs.org/docs/latest-v24.x/api/zlib.html#zlibcrc32data-value)和 [ZIP 官方格式](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)，身份核对使用 SHA-256。

附件恰为 `affinity-mcp-<version>.zip`、`release-manifest.json`、`SHA256SUMS`。schema v1 的 manifest 以 UTF-8 无 BOM、两空格缩进、LF 和一个末尾 LF 序列化；字段依次为 schema_version、recipe_version、version、release_date、source_sha、production_base_sha、production_tree_sha、tag、files、archive、verification_scope。schema_version 为整数，recipe_version 为字符串；files 按 UTF-8 路径排序，逐项保存 path、六位 mode 和小写 SHA-256。SHA256SUMS 只含 ZIP、manifest 两行，按文件名字节序排序，每行为 hash、两个空格、文件名与 LF。清单不包含自身 hash、生产 commit、CI/审批记录、时钟或本机路径。

校验从固定 source 重建，并比较三项附件的精确字节，重新解析 ZIP 和计算 Git tree，核对显式候选校验值。三项附件互相匹配仍不足以证明来自正确 source。安装模拟分别检验 ZIP 与生成的 main 树，结果记录真实运行环境；不声明真实 SDK、客户端或市场验收通过。配方到已审工具提交和精确 Node 版本的受保护映射、生产 commit/审批/恢复绑定属于发布协议，当前本地命令不创建这些远端状态。

## 每批修改怎样编号

1. 开始一批开发交付前，确认上一开发交付和当前正式基准的提交及版本；不能仅凭本地分支名称或缓存的远端引用推断它们是最新状态。
2. 本批实现、配置、Skill/references、文档、测试及维护工具的修改合并考虑。同一批的修正、验证与复审只更新一次版本，不按文件保存、测试次数或审查轮次递增。
3. 同一目标在上一开发交付基础上递增 `N`；累计产品影响需要更高目标时选择新 core，并从 `dev.1` 开始。不得倒退目标或借纯维护变化消耗正式 PATCH。
4. 在 `CHANGELOG.md` 的 `Unreleased` 和 `CHANGELOG.zh-cn.md` 的“未发布”分组中，同步用三级版本标题记录当前候选及本批用户可见变化，版本与清单一致；没有用户可见变化时按下文标注，不用内部维护活动凑条目。开发批次交付后同时归入实际 UTC 日期；没有待交付候选时，清单对应日期分组中的已交付版本，不在未发布分组重复记录。正式交付时汇总同一目标的累计产品变化。写入版本不是提交、推送或发布凭据。
5. 候选工作树完成适用检查与独立审查后，再按用户授权组织提交。各次提交按职责组织，版本号及所有现行版本声明统一放在本批最后一个 commit 中，并核对最终提交与已审内容一致。后续仍属于本批的修正不增加编号，但须重新检查、审查和整理，保证这些变更仍仅出现在最后一个 commit 中。提交与推送仍服从用户授权。

启用批次 CI 时，仓库须只允许 squash 合并，develop 使用线性历史和最新分支检查；PR 分支通过 rebase 更新。每批一个 PR、一次 dev.N，合并后的 squash 提交再次运行 push CI。PR 标题、区间内每条提交消息不得含 GitHub 的 skip 指令；合并时仍须核对人工编辑的最终消息。完全跳过的运行不能自行报告缺席，不能把旧绿灯或手动运行当作该次 push 的成功证据。

历史源码按明确授权从 `0.1.0` 重编号：初始源码为 `0.1.0`，新增可配置超时及结构化诊断为 `0.2.0`，新增安装连接检查 CLI 为 `0.3.0`；运行脚本随 Skill 打包的迁移目标为 `0.4.0-dev.1`，对应正式源码身份为 `0.4.0`。内容提交保留前一版本，批次末尾统一更新身份；初始源码是单一 bootstrap 提交。历史日期沿用对应旧编号首次可确认的实际交付日，不用本次重编号时间或作者日期代填；缺少证据的节点、版本号、日期和标签不补造。详见[更新日志](../CHANGELOG.md)。

重编号后的历史开发基准为 `0.4.0-dev.1`，正式基准为 `0.4.0`。这次迁移是一次明确授权的源码身份与提交历史改写，不改变协议日期、应用构建、实验日期或实际运行观察，也不构成日常覆盖已发布历史的许可。新旧提交和 tag 不会在旧 clone 或宿主缓存中自动替换；实际引用采用、推送和安装状态分别读回核验，不能由本页或版本号推断。

## 必须同步的位置

- [Codex 清单](../.codex-plugin/plugin.json)、[Claude Code/ZCode 清单](../.claude-plugin/plugin.json)和[共用市场条目](../.claude-plugin/marketplace.json)使用同一个完整版本。
- [代理](../skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs)中的 `clientInfo.version` 与 `serverInfo.version` 使用相同版本，MCP 协议日期不随之改变。
- [文档入口](README.md)、[架构说明](architecture.md)、[SDK 版本身份表](sdk/README.md#version-identity)及两份 CHANGELOG 的现行版本标题同步；待交付候选位于英文 `Unreleased` / 中文“未发布”，已交付版本位于实际日期分组。根中英文 README 的渠道和安装说法同步；它们不另复制当前数字。
- 历史 SDK 观察、真实安装身份和已发布日志保持原值及证据边界；明确授权的源码重编号只更新对应的源码身份与链接，并标明它是映射，不冒充当时实际加载的版本，不作全仓字符串替换。

Codex 提交检查要求非空、最长 64 字符的语义化版本字符串。[官方清单错误说明](https://developers.openai.com/plugins/deploy/submission-errors#plugin-manifest-errors)。Claude Code 的显式版本参与缓存更新，插件清单中的版本优先于市场条目；ZCode 用市场条目的版本判断更新，用插件清单读取已安装版本。因此本仓库保留三处并校验一致，不能仅更新其中一处。[Claude Code 版本字段](https://code.claude.com/docs/en/plugins/manifest-reference#version)、[Claude Code 更新说明](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version)、[ZCode 插件管理](https://zcode.z.ai/en/docs/plugin#manage-plugins)。

这些官方字段契约和静态检查不构成已安装副本验收。选择开发来源、降级到正式渠道、缓存替换、宿主实际加载及真实 Affinity SDK 行为，需要按对应任务另行核对；同名插件不能仅靠后缀保证渠道隔离或自动切换。

## 两类检查

开发树的格式与同步检查无需 Git 历史，也不判断本批是否递增：

```shell
node scripts/check-version.mjs --channel development
node --test scripts/check-version.test.mjs
```

交付增量检查要求 **Git 2.45+**，以及**已由维护者确认**的两个本地提交：上一开发交付和正式基准。以下占位符替换为确认后的完整提交 SHA：

```shell
node scripts/check-version.mjs --channel development --from <previous-development-commit> --stable <confirmed-production-commit>
```

`--from` 使用上一开发交付的 `dev.N`，`--stable` 对应已确认的 `main` 正式快照，不能误用旧开发版本作为生产基准。首次从旧稳定格式迁移时仍支持明确指定旧开发快照。基准解析为本地 commit，并读取三份清单和两个代理声明核对一致；仅在历史基准内识别 `scripts/affinity-mcp-proxy.mjs` 与 `skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs` 两种已知布局，必须恰有一个入口。零个或两个入口、缺对象、缺必要文件或不一致都失败，不在读取失败后尝试另一入口。当前文件系统仍要求新布局。脚本不自动 fetch，不修改 Git 状态，也不能证明指定基准是远端最新版本；需先完成相应只读核验，保留输出的完整 SHA。

所有基准 Git 命令显式使用 `--no-lazy-fetch`，禁止部分克隆（partial clone）为缺失对象自动访问 promisor 远端或补写本地对象。缺对象时返回固定失败信息；旧 Git 不支持这个选项时同样失败，不降级为允许取对象，也不自动升级 Git。该选项从 [Git 2.45](https://raw.githubusercontent.com/git/git/v2.45.0/Documentation/RelNotes/2.45.0.txt) 引入，行为见[官方 Git 选项](https://git-scm.com/docs/git#Documentation/git.txt---no-lazy-fetch)。无基准的静态模式仍不调用 Git。

`--channel` 选择版本格式，不等同于 checkout 的分支名。`develop` 转正后先运行正式格式的静态及增量检查：

```shell
node scripts/check-version.mjs --channel stable
node scripts/check-version.mjs --channel stable --from <confirmed-production-commit>
```

同步 `main` 时，从开发 checkout 的检查器显式指定 `--root <production-tree>`，使用 `--channel stable --from <previous-production-commit>`；被检查的 Git 仓库需含基准对象。正式候选要求三清单、两个代理声明及与稳定版本匹配、日期有效的本版 CHANGELOG 条目；开发树转正时还核对现行文档身份，生产树可以不包含 `docs/`，但存在该目录时须具备完整且一致的身份声明。移除当前未发布的开发版本标题；没有待交付内容时省略“未发布”分组。为只读核验已发布的旧树，检查器仍接受历史空分组、旧式 `[Unreleased]` 和版本日期合并标题；新日志统一使用日期分组。检查器只验证元数据，不查询或确认真实发布日期、远端发布状态或目标可见性。

[CI](../.github/workflows/docs-hooks.yml)的静态检查按清单格式选择渠道，独立的[交付检查](../scripts/check-delivery.mjs)验证事件及历史；实际平台配置与生产启用须单独验收。PR 历史使用事件 `base.sha..head.sha`，集成回归使用该事件的 merge SHA；push 使用 `before..GITHUB_SHA`。CI 显式取得并固定 main SHA，检查完整对象、祖先关系、线性历史及最后提交的全部现行声明。普通文件编辑不算版本修改；中途改版又回退、漏同步、未升版、跳号或缺对象均失败。版本解析和递增仍复用原检查器，检查阶段不隐式 fetch。源码、workflow 和工具身份及门禁差异写入运行日志与 job summary，人工审查仍须防止 PR 自行弱化门禁。

可在含完整对象的临时仓库中，对已形成提交的候选运行以下只读检查；未提交工作区仍使用上面的静态/增量命令，不能冒充提交历史检查：

```shell
node scripts/check-delivery.mjs --base <previous-development-commit> --head <candidate-commit> --stable <confirmed-production-commit>
node scripts/check-links.mjs
```

交付模块提供 `checkCandidateDelivery`，显式区分 `promote`、`date-revision`、`withdraw`，读取固定控制根的真实历史和正式目标状态；调用者不能用布尔值或本地成功记录代替证据。CI 先按前后版本形态选定模式，失败时不回退到其它模式。特殊转换须有固定 `RELEASE_CONTROL_ROOT` 且 `RELEASE_ENABLED=true`，该配置只在平台验收后启用；检查本身不使用生产凭据或写入。静态 stable 通过不能绕过候选协议。手动只读 CI 必须提供 `base_sha` 且选择 develop；入口和输入见下文。

## 受控工作流入口

生产配置默认关闭。获授权维护者先完成目标仓库的规则、Environment、App、控制根和实际恢复入口验收，再设置 repository variables：`RELEASE_ENABLED=true`、固定根 `RELEASE_CONTROL_ROOT`、符合[预检 schema](../scripts/release/evidence.mjs)的 `RELEASE_POLICY`，以及绑定本次 source/tool/包的 `RELEASE_REVIEW`。针对撤销和控制恢复，使用只绑定工具与控制协议范围的 `RELEASE_CONTROL_REVIEW`。`RELEASE_APP_PRIVATE_KEY` 仅保存在预建的 `production` Environment。这些配置值和本地通过记录不代替实际平台验收或人工批准。

同一个 workflow 的手动模式均固定 ref 为 develop。除只读 `ci` 可保留原简单调用外，所有模式还必须提供 `expected_tool_sha`（已审查 develop 工具完整 SHA）和 `entry_id`（本次唯一的 32 位小写十六进制标识）；不允许跨模式的多余输入。

| operation | 必需输入 | 效果 |
| --- | --- | --- |
| `ci` | `base_sha` | 重验当前 develop 的普通或已启用候选规则，不充当原 push |
| `publish` | `source_sha`、原 main `base_sha`、`version`、`push_run_id`、`push_attempt`、`ref_artifact_id`、`ref_artifact_digest` | 重新准备尚未正式交付的准确 source，原准确 push 证据必须仍可读取 |
| `recover` | `source_sha`、原生产父 `base_sha`、准确 `production_sha`、`receipt_sha`、`version` | 复用已交付生产提交，重新测试/安装/审查/批准后只补后续缺项 |
| `retire-candidate` | `source_sha`、`version`、`reason`（`date-revision` 或 `withdraw`） | 针对性批准后永久撤销准确未交付候选的首发资格 |
| `control-recover` | `source_sha`、`version` | 针对性批准后对账已终止旧 owner，不重放业务请求 |

main 保持生产树，不放 workflow。[受控入口工具](../scripts/release/entry.mjs)使用当前维护者已有的 `gh` 登录凭据，先读取目标仓库管理身份、已登记 workflow、main/develop 和固定工具，再提交一次直接 dispatch；生产模式另核对控制记录。它不使用发布 App 的 token 修改设置，也不建立新 PAT。调用参数为 `--repository`、`--repository-id`、`--workflow-id`、`--input`（上述模式字段的 JSON 文件）、`--journal`（新的本地审计文件）；生产模式另提供 `--control-root`。从本地仓库 checkout 内调用，本地文件放在其 `.scratch/` 下以 `ai-agent-` 开头的目录，不纳入仓库。工具解析日志父目录的真实路径，核对它位于该区域且确实被 Git 忽略，再以独占创建方式保留日志；不接受仓库根目录中仅文件名带此前缀的路径。`entry_id` 可由工具生成，`expected_tool_sha` 必须明确提供。

只有直接 dispatch 明确返回 404/422、注册及输入已核对、且只读列表没有本次入口记录，才采用已选兜底：记录意图后临时把默认分支切为 develop，读回、触发一次，并立即恢复 main。恢复发生在测试、批准和运行详情查证之前；触发响应未知时也是先恢复，再按唯一入口标识及准确 SHA 只读查证。其它权限/限流错误停止，网络未知不进入二次触发。运行 API 不返回原输入全文；审计中的输入是实际提交值，run 归属由 ID、仓库、事件、ref 短名、工具 SHA 和唯一标题交叉核对，不能把本地输入记录称为平台读回。

默认分支恢复失败保持 blocked；出现另一个管理员设置的第三分支时不自动覆盖。进程被强制终止不能保证执行 finally，维护者须按已落盘的原设置和意图检查、恢复 main，并查证是否已有运行；不得删除记录后盲目再触发。暂切默认分支期间，默认展示、PR 基线及未固定 ref 的安装/更新可能取到 develop，不能承诺零影响。发布/控制摘要和 token 发行前均再次要求默认分支为 main；旧 run rerun 仅作有限期补充，不是常规恢复保证。

正常发布及补缺从同运行 outputs 接收准确制品/验证/审批交接，`discover*` 和 `publish`/`resume`/控制 CLI 是 workflow 内部接口，不提供本地直接发布旁路。包、安装回执、审计的保留与导出边界见[hooks 说明](hooks.md)。新工具解释原 recipe v1 时必须保持字节兼容；当前原 push 的 workflow blob 还须等于控制根固定工具的 workflow blob，改变该检查集合前需先制定并审查版本化迁移，不能临时豁免或重建控制根。

## CHANGELOG 与正式交付

更新日志按语言分别维护：`CHANGELOG.md` 为英文，根标题为 `# Affinity MCP Changelog`；`CHANGELOG.zh-cn.md` 为简体中文，根标题为 `# Affinity MCP 更新日志`。两份日志的版本、日期、分类、条目数量和语义逐项对应，版本检查在中文日志存在时核对结构一致性，不代替翻译语义审阅；历史单日志快照仍可只读核验。二级标题用 `## YYYY-MM-DD` 按交付日期倒序分组，组内用 `### MAJOR.MINOR.PATCH` 或完整开发版本标识版本。英文分类为 `Added`、`Changed`、`Fixed`、`Deprecated`、`Removed`、`Security`，中文依次为“新增”“变更”“修复”“废弃”“移除”“安全”，均使用四级标题，不保留空分类。同日多个版本共用日期分组。待交付候选分别放在顶部 `## Unreleased` / `## 未发布` 分组中，不为尚未发生的开发交付填日期；候选版本标题与清单一致。没有待交付内容时同时删除未发布分组，清单版本在对应交付日期下恰有一个条目。

日期取本版首次实际交付的 UTC 日历日，开发和正式渠道均保留各自记录。历史编号重映射沿用对应旧编号的首次可确认交付日。优先核对 [GitHub 仓库活动](https://github.com/Paloexiz/Affinity-MCP/activity)中的实际推送事件与对应源码版本；[活动 API](https://docs.github.com/en/rest/repos/repos#list-repository-activities)提供时间、分支与前后提交，不把 Git 作者、提交者或 tagger 日期当作推送日期。缺证据时使用“日期待核实”分组。正式候选按以下流程预填计划日期，交付后核对实际事件。按 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的原则保留逐版本、同类变化和最新在前的摘要；日期分组与对应语言的分类是本仓库的展示约定。

两份 CHANGELOG 均面向插件使用者，只写对应版本实际带来的能力、问题修复、兼容性及安装、升级或操作方式变化。先对照该版本的实际差异，再直接写“变了什么、影响什么”；不能仅把旧文缩短，或用“完善”“加强”“优化”等泛称代替具体变化。Skill/references 的更新写用户操作行为的变化，不搬运 Agent 执行步骤、实验过程或验收流水。内部版本治理、CI/hooks/测试维护、Git 操作、文档同步和日志自身的编辑活动留在维护文档或提交记录；不写“更正某版说明”“精简更新日志”等自我描述。未变化内容只在解释兼容性影响时简短保留。会话、私人路径和本机测试记录不得进入日志。

版本编号与用户变化分开判断。保留每个已交付版本的版本号和日期；仅内部维护、没有用户可见变化的版本，在版本标题下写“无用户可见变更。”，英文为“No user-visible changes.”，不设分类、不制造变更条目。开发版本遵守相同内容边界。正式摘要汇总相对上一正式版本的累计用户变化，不因一次文档批次创建正式版本记录。

### 开发候选转为正式版本

正式目标的 core 确认且候选验收通过后，将 `MAJOR.MINOR.PATCH-dev.N` 转为同 core 的 `MAJOR.MINOR.PATCH`，例如 `0.5.0-dev.1` 转为 `0.5.0`。SemVer 规定预发布版本的优先级低于对应无后缀版本，但版本号本身不证明验收或发布完成；`0.y.z` 仍属于初始开发阶段，进入 `1.0.0` 表示开始定义稳定的公共 API。[SemVer 第 4、5、9、11 条](https://semver.org/spec/v2.0.0.html)。

以下准备、冻结流程及 UTC 日期口径是本仓库约定，不是 SemVer 或 Keep a Changelog 唯一规定的发布流程。只记录流程或更新开发候选不构成正式交付授权：

1. 先明确本次授权的正式目标和成功判据，例如用户可安装的远端 `main` 引用及对应制品。GitHub Release 是否为目标由本次授权决定，不是既定前提。交付报告记录目标引用、提交、制品身份及首次正式交付事件，不能仅凭版本号、日志日期或检查成功宣布发布。
2. **先在 `develop` 转正。** 移除候选的 `-dev.N` 后缀，同步三清单、代理两处声明和现行文档，选择计划首次交付的 UTC 日期，将当前未发布内容和已交付开发批次的累计产品变化同步整理为两份 CHANGELOG 中该日期下的正式版本条目，保留历史条目。删除已转为正式版的未发布开发标题、空的 `Unreleased` /“未发布”分组及只对草稿成立的临时状态声明；候选状态放在交付报告中，稳定制品不写入将来会失真的“尚未发布”标记。
3. 验证转正后的确切文件内容：在 `develop` 候选工作树完成[正式格式的静态与增量检查](#两类检查)、适用测试及独立审查。审查本批改写的全部 CHANGELOG 条目及 Release 说明，逐条对照对应版本的实际差异，确认具体用户影响、版本归属和双语语义；删掉没有用户影响的维护叙述，必要时使用上述无变更标记。正式摘要以此前正式版本为基准，不能把旧功能再列为新增。结构检查通过不代表内容合格。随后按授权组织提交，版本号及所有现行版本声明统一放在本批最后一个 commit 中。后续内容变化须重新完成受影响的检查与复核。**先提交并推送 `develop`**，回读远端确切 SHA、版本和交付日期，并核对 CI；这一步完成后才能同步 `main`。
4. **从已推送的 `develop` 提交同步 `main`。** 使用上一步的确切 SHA，按 [main 分支保留范围](#production-content)逐文件提取安装内容及同一套根中英文 CHANGELOG，移除候选中的开发资料遗留项；不得递归复制整个资源目录。仅保留生产 README 的有效文档链接、去除依赖开发测试目录的说明，并保留生产忽略规则。不在 `main` 首次转正、不再次修改版本或 CHANGELOG，也不只合并历史关系。核对完整生产文件集合、引用、版本、测试和审查结果后，提交并推送 `main`，回读远端 SHA 与文件内容。
5. 首次正式交付须发生在准备的 UTC 日期。`main` 已提供本版、正式 tag 已存在或公开 Release 已提供本版，任一成立即冻结版本、内容和日期；`develop` 转正推送、CI 制品和仅有草稿 Release 不单独算正式交付。转正推送后、首次正式交付前进入候选冻结窗口，只允许下述日期修订或明确撤回；普通功能、配置和文档批次暂缓。结果不明时停止并只读核验，不能把命令失败视为未交付。已交付版本跨日补齐剩余步骤时仍使用原内容与日期。
6. 按已授权范围创建 tag 或 GitHub Release，并绑定已核对的生产提交；若使用 GitHub Release，正式版本不勾选预发布标记，说明仅使用英文，对应英文 CHANGELOG 的本版内容，不附其他版本条目。启用不可变 Release 时，先建立草稿并补齐附件，再发布。回读 tag 指向、Release 状态及附件身份；市场可见性和实际安装副本另行核对，安装文件一致不等于宿主已刷新或在线连接通过。[GitHub 发布流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

### 未正式交付候选的修订与撤回

正常自动发布工具的协议见[准确发布证据与正常交付](architecture.md#准确发布证据与正常交付)。`preflight` 读取已配置的保护身份；`discover` 生成审批摘要及同运行交接；`publish` 只在受保护 develop job 中接受同次 outputs，先保存准确原 push CI receipt，再按 main、annotated tag、draft、三附件下载核对、公开/latest/immutable 的顺序完成交付。首次 main 写入缺准确原 CI 或 source 已不是 develop tip 时停止；手动运行、本地测试及任意成功字段不能豁免。首次日界前 120 秒不开始写入，成功读回发现实际跨日则冻结已交付内容并停止后续。实际平台配置与生产启用须单独完成验收

main 已交付后的 `recovery-report`、`discover-recovery` 和 `resume` 分别用于只读发现、新验证交接和批准后的补缺，详见[恢复契约](architecture.md#已交付版本的补缺恢复)。输入固定旧 source、原生产父、准确生产提交、receipt、版本与控制根；只能复用已交付 P，不能重建并改写 main。原 CI 不可取得时仍须完整新检查、同包安装模拟、新独审和新批准；权限或网络未知不能套用此例外。旧 source 已 retired、旧 owner/未知意图、错误 tag/附件以及缺持久绑定均停止。模块回归不表示实际恢复 workflow、入口和平台保护已启用。

转正只允许同 core 的 dev→stable，并以准确 main 检查正式增量。差异限定为三清单版本、代理两处版本、文档入口/架构/SDK 的四处现行身份，以及本版双语正式摘要和日期。当前没有允许修改的草稿状态句；正文、workflow、测试或其他功能修改须先交付普通开发批次。已有日期分组中的开发和正式历史字节保留；仅当前 Unreleased 开发条目可由正式摘要替代。固定字段见[交付检查器](../scripts/check-delivery.mjs)，不能按整文件版本字符串替换来豁免其他差异。

日期修订和撤回都先通过[控制 guard](architecture.md#发布控制记录与故障恢复)永久撤销准确当前 stable source C 的首次发布资格。guard 取得共同 owner、排除未决写入并确认 main/tag/公开 Release 均未交付，才追加 retired 记录；取消任务不代替该事实。PR 检查只读，必须验证完整控制历史、没有当前 owner/意图，以及 C 的确切 retired 记录。PR 的事件 base 必须仍为 develop tip；push 的 before 为 C、head 为当前 develop tip，正式基准必须等于当前 main。读取失败或状态变化均停止，旧 PR 绿灯不能授权新 base。

- **只改日期**：版本不变，只将两份 CHANGELOG 中本版的完整条目原样移动到不同的有效 UTC 日期分组；可创建新组、删除因此空出的组。标题、分类、正文及所有历史条目的内容和相对顺序保持字节一致，其他文件及 mode 不变。同日期空提交不算修订。此狭窄例外不另增 dev.N，也不强推移动旧 bump。
- **发现问题后撤回修复**：从 C 沿单父历史只跨过合法的同版本日期修订，找到最近一次合法转正 P 及其直接开发父 D。W 必须是 D 的同 core、下一 dev.N；例如 dev.3→stable→dev.4，再次撤回则 dev.5。完整 C→W 仍执行线性历史、skip 指令和末提交声明检查，可纳入修复；双语日志仅移除本次未交付 stable 条目，新增 Unreleased/未发布的开发摘要，保留历史条目。不可任取旧 D、重置编号、改 core 或把普通检查失败自动转为撤回模式。

新的合格 PR 经 strict up-to-date 和普通 squash 交付后，以新 source 重新检查、构建、审查和批准；旧包与旧批准失效。两个同 base PR 先合并一个后，另一个必须更新基准并重新检查。关闭 PR 不恢复旧 C 的发布资格；日期/撤回历史和旧提交保留。任何正式目标已交付、控制意图未知或历史对象缺失，都不能使用这些例外。各平台保护与实际事件的验收仍须独立完成。

历史缺证据时把版本置于英文 `Date unverified` / 中文“日期待核实”分组，链接已确认提交，不拿计划日期或 Git 作者/提交时间代替发布日期，不创建不存在的标签链接。

正式交付以 [main 分支保留范围](#production-content)为准，不机械合并整个开发树。检查、提交、推送、tag、GitHub Release、市场可见版本及已安装副本是不同状态，逐项以实际证据报告。版本已交付后不得改写同版本内容；后续修正进入新版本，不自动删除旧 tag 或强推历史。
