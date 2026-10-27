# 版本与变更日志

本页说明 Affinity MCP 如何划分开发批次和正式版本，以及每次交付前后要做哪些检查。用户能理解的变化记录在[英文更新日志](../CHANGELOG.md)和[中文更新日志](../CHANGELOG.zh-cn.md)里，两边同步更新。插件版本、MCP 协议日期、Affinity 应用构建号和 SDK 历史观察是四类不同的信息，各自维护。

## 现行交付方式

每批开发在 `develop` 本地完成核验与独立审查后，经用户授权推送；正式发布到 `main` 仍需单独授权。每批只递增一次 `dev.N`，交付完成后按 UTC 日期做一次仅移动双语当前条目的日期收尾，版本号不变。使用 PR 时，标题、说明及提交信息仍须遵守[英语写法约定](maintaining.md#写法约定)。

## 版本和渠道

本仓库采用 [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) 的版本格式和优先级，但只允许下面两种写法，不使用前导 `v`、前导零、构建元数据或其他预发布标签：

| 分支 / 渠道 | 格式 | 含义 |
| --- | --- | --- |
| `main` / 正式 | `MAJOR.MINOR.PATCH` | 正式交付版本，只包含用户安装树及根中英文 CHANGELOG；实际交付另行核验 |
| `develop` / 开发与发布准备 | 日常使用 `MAJOR.MINOR.PATCH-dev.N`；正式交付时转为 `MAJOR.MINOR.PATCH` | `N` 从 1 起，按开发交付批次递增；正式版本先在本分支提交并推送，再同步到 `main` |

例如，正式基准为 `0.4.0` 时，接下来的修复目标依次是 `0.4.1-dev.1`、`0.4.1-dev.2`。准备正式交付时，先在 `develop` 把版本改成 `0.4.1`，完成检查、审查、提交和推送，再把该提交中的生产内容同步到 `main`。版本号写成稳定格式，并不代表已经发布。按 SemVer 的优先级，`0.4.0 < 0.4.1-dev.1 < 0.4.1-dev.2 < 0.4.1`；数字部分按数值比较，所以 `dev.10` 高于 `dev.9`。这只说明源码版本的先后顺序，不能说明已安装的宿主会怎样跨渠道更新。

开发目标的核心版本号（core）取决于相对正式基准累计的产品交付影响：兼容的修复递增 PATCH，兼容的新能力递增 MINOR。到 `1.0.0` 以后，不兼容的公开契约变化递增 MAJOR。`0.y.z` 仍属初始开发阶段，本仓库在这个阶段把不兼容变化放进下一个 MINOR，并写清迁移影响；只有准备承诺稳定公开契约时才进入 `1.0.0`。公开契约包括：插件标识和安装布局，启动配置与环境变量，代理对客户端暴露的消息和错误行为，以及随包 Skill 承诺的工作方式。Affinity 外部 SDK 的全部能力不在本插件的版本承诺范围内。

默认只取正式基准的下一个 PATCH、下一个 MINOR 或下一个 MAJOR，低位归零。同一目标 core 上的连续开发批次，`N` 必须逐次加 1；目标 core 上调时，`N` 重置为 1，也就是从 `dev.1` 开始。这是本仓库为方便审查而定的递增规则；SemVer 本身并不要求历史版本号连续。校验器只能核对这类数值约束，一次改动该算哪种影响级别，仍要由维护者判断。

正式交付后，`develop` 上保留这个正式版本号。开始下一批开发时，维护者先核对正式基准，再选择下一个目标并从 `dev.1` 开始；不要在同步 `main` 时就提前开下一批开发版本。

只改文档、测试、CI、hooks 或仓库维护工具的交付，同样递增开发版的 `dev.N`，用于标记开发快照；这类变化本身不需要正式升版。没有正式交付授权时，只维护开发渠道。用户明确要求转正时，先在 `develop` 转正并推送，再把正式版本和生产内容同步到 `main`。既定的下一个目标可以一直承载维护批次，但不能因为一次维护修改就自行发起正式发布。

采用“下一个目标 core + `dev.N`”的写法，可以一眼看出候选属于哪个正式目标，也保持候选版本和正式版本之间的 SemVer 关系。如果固定在较低的 core 上一直加开发序号，版本会长期低于后来的正式版，渠道切换时更难解释，所以不采用。开发渠道和正式渠道使用同一个插件标识和市场名称；它们不是两个可以同时安装的独立产品。

<a id="production-content"></a>
## main 分支保留范围

`main` 存放的是完整 Plugin 的生产分发树，只能按下表的**具体文件允许清单**同步。目录名不代表目录里的所有文件都能发布，尤其不能把 `assets/` 或 `skills/` 整个复制过去。要新增运行依赖或用户资料时，先在 `develop` 更新本节，核对这些文件的用途和引用，再进入正式交付流程。

| 用途 | 允许保留的文件 |
| --- | --- |
| Plugin 与市场入口 | `.agents/plugins/marketplace.json`、`.codex-plugin/plugin.json`、`.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json`、`.mcp.json` |
| Agent 使用入口与 references | `skills/affinity-mcp/SKILL.md`；`skills/affinity-mcp/references/` 下的 `sdk-verified.md`、`scripting-pitfalls.md`、`page-geometry.md`、`inspection-preview.md` |
| 随包运行工具 | `skills/affinity-mcp/scripts/` 下的 `affinity-mcp-proxy.mjs`、`affinity-mcp-smoke.mjs`、`inspection-preview.mjs` |
| 用户说明与版本摘要 | 根目录的 `README.md`、`README.zh-cn.md`、`CHANGELOG.md`、`CHANGELOG.zh-cn.md`、`PRIVACY.md`、`PRIVACY.zh-cn.md`、`TERMS.md`、`TERMS.zh-cn.md` |
| 许可与署名 | 根目录的 `LICENSE`、`LICENSE.upstream`、`NOTICE` |
| 安装及用户说明直接使用的资源 | `assets/affinity-mcp-icon.svg`、`assets/affinity-mcp-settings.png` |
| 生产 Git 规则 | 根目录的 `.gitattributes`、生产专用 `.gitignore`；不复制开发工具配置 |

`docs/`、根目录的 `scripts/`、项目的 hooks/CI 配置、`AGENTS.md`、测试、夹具和验证证据只留在 `develop`。`assets/sdk-evidence/` 里的资料即使已经公开、做过脱敏且为合成数据，也仍属开发证据，不进入 `main`。“可以公开”“已被 Git 跟踪”“放在 `assets/` 下”都不能作为分发依据。缓存、备份、原始记录、依赖安装目录和本地 Agent 状态同样不进生产树。随包 Skill/references 是 Agent 实际使用的资料，要单独判断，不能跟这些开发文档一起处理。

所有文档、源码和发布范围的修改都先在 `develop` 完成。生产候选取自经过核对的开发提交，只从中提取允许文件，并保留规定的生产 README 链接适配和 Git 规则；不要在 `main` 上写开发文档，也不要另外修正功能。

当前中英文 README 里指向 `docs/versioning.md` 的相对链接，在生产副本中要换成 HTTPS 固定链接，指向本次已核对开发提交里的同一文件；`develop` 保留原来的相对链接。不能为了保留相对链接就把 `docs/` 复制进生产树。机器可读的清单见 [production-files.json](../scripts/production-files.json)，生产用的忽略规则来自[独立模板](../scripts/production.gitignore)。[链接检查器](../scripts/check-links.mjs)会按本表核对文件集合、来源和安装引用；它不生成生产包，也不证明现有的 `main` 已经符合这张清单。

同步验收须同时满足：

1. 用 `git ls-tree -r --name-only <production-commit>` 核对完整文件集合，确认与上表一致。提交前还要检查候选工作树和新增文件；不能只看本次新增了哪些文件，也不能以为 `.gitignore` 会替你把已经跟踪的文件删掉。
2. 清掉生产候选里历史遗留的排除项，并确认删除范围只涉及开发资料。`develop` 上的文档、夹具和测试引用要保持完整。
3. 在只含允许文件的生产候选上，确认清单、运行资源、用户文档和 Skill/references 的所有本地引用都能解析。安装、阅读和运行都不能依赖 `docs/`、测试夹具或开发用的 checkout。安装副本也要按同一张清单核对。
4. tag、GitHub Release 及其附件只能绑定通过了上述验收的生产提交；开发分支的完整源码压缩包不能当作生产安装包。把允许清单写下来，并不表示远端已有的生产树已经清理完毕。


## 每批修改怎样编号

1. 开始一批开发交付前，先确认上一开发交付和当前正式基准分别是哪个提交、哪个版本。不能只凭本地分支名或缓存的远端引用就断定它们是最新状态。
2. 本批的实现、配置、Skill/references、文档、测试和维护工具修改合并计算。同一批里的修正、验证和复审只更新一次版本号；不要按保存文件的次数、测试次数或审查轮次递增。
3. 同一目标在上一开发交付的基础上把 `N` 加 1。累计产品影响需要更高目标时，换成新 core 并从 `dev.1` 开始。目标不能倒退，也不能借纯维护改动去消耗正式 PATCH。
4. 在 `CHANGELOG.md` 的 `Unreleased` 分组和 `CHANGELOG.zh-cn.md` 的“未发布”分组里，两边都用三级标题写出版本号，记录当前候选和本批用户能感知的变化，版本号要和清单一致。没有用户可见变化时，按后文规则标注；不要拿内部维护活动凑条目。开发批次实际交付后，把这些条目移到真实的 UTC 日期分组下。没有待交付候选时，已交付版本只出现在对应日期的分组里，不在“未发布”里重复记录。正式交付时，再汇总同一目标下累计的产品变化。
5. 候选工作树通过适用的检查和独立审查后，再按用户授权组织提交。每次提交按职责划分；版本号及所有现行版本声明统一放进本批最后一个实现 commit，并核对最终提交与已审内容一致。之后如果还有属于本批的实现修正，不增加编号，但要重新检查、审查和整理提交，保证版本变更仍只出现在最后一个实现 commit 里。提交与推送仍以用户授权为准。


<a id="development-date-closure"></a>
### 开发交付后的日期收尾

开发版本的“首次交付”，指获准的 push 第一次把该版本带进目标仓库 `refs/heads/develop`，使实际引用更新；历史 PR 合并也按同一标准核对。交付日期取平台活动时间的 UTC 日历日，并且这条活动必须绑定准确的仓库、完整 ref 和 before/after SHA。feature 分支的 push、Git 元数据、PR 检查或 CI 完成时间都不能替代这条事件。用[仓库活动 API](https://docs.github.com/en/rest/repos/repos#list-repository-activities)查询时，要按所选 API 版本核对实际时间字段；历史合并活动可能是 `pr_merge`，不能只筛普通 push。找不到明确匹配的事件就停下来，不要猜日期。

实现提交里，当前开发条目留在 `Unreleased`／“未发布”，版本号和现行声明只在最后一个实现 commit 更新。确认实际交付事件后，允许追加一个严格限于日期的收尾 commit：版本号不变，只把两份 CHANGELOG 里当前开发版本的完整条目原样移到已确认的实际 UTC 日期下。可以删掉因此空出的分组，也可以复用同一日期分组；历史内容和相对顺序、其他文件及 mode 都不变。这个例外不增加 `dev.N`，不改旧提交，也不适用于 stable 日期修订、候选撤回或恢复。如果事件已经发生、日期还没收尾，条目暂时留在“未发布”，只表示日志尚未收尾。两次推送分别核对准确 SHA；日期收尾和远端读回完成后，才报告本批完整交付。

日期收尾要单独核对差异：只允许双语当前条目移动日期，版本声明、条目内容、历史记录和其他文件保持不变。实际日期仍需平台事件取证与独立审查；已经日期化的条目不能借这个例外再次改日期。证据有误或缺失时，保持未完成状态。

历史源码经过一次明确授权的重编号，从 `0.1.0` 开始：初始源码是 `0.1.0`，新增可配置超时和结构化诊断的是 `0.2.0`，新增安装连接检查 CLI 的是 `0.3.0`；运行脚本随 Skill 打包的迁移目标记为 `0.4.0-dev.1`，对应的正式源码身份是 `0.4.0`。内容提交先保留前一个版本号，到批次末尾再统一更新身份；初始源码只有一个 bootstrap 提交。历史日期沿用对应旧编号首次可确认的实际交付日，不能用这次重编号的时间或作者日期代填；缺少证据的节点、版本号、日期和标签都不要补造。详见[更新日志](../CHANGELOG.md)。

重编号后的历史开发基准是 `0.4.0-dev.1`，正式基准是 `0.4.0`。这次迁移是一次明确授权的源码身份和提交历史改写，不改变协议日期、应用构建、实验日期或实际运行观察，也不构成日常覆盖已发布历史的许可。新旧提交和 tag 不会在旧 clone 或宿主缓存里自动替换；实际引用采用、推送和安装状态都要逐项读回核验，不能靠本页或版本号推断。

## 必须同步的位置

- [Codex 清单](../.codex-plugin/plugin.json)、[Claude Code/ZCode 清单](../.claude-plugin/plugin.json)和[共用市场条目](../.claude-plugin/marketplace.json)必须使用同一个完整版本。
- [代理](../skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs)里的 `clientInfo.version` 和 `serverInfo.version` 必须是同一个版本；MCP 协议日期不跟着变。
- [文档入口](README.md)、[架构说明](architecture.md)、[SDK 版本身份表](sdk/README.md#version-identity)和两份 CHANGELOG 的现行版本标题要一起更新。待交付候选放在英文 `Unreleased` / 中文“未发布”分组，已交付版本放在实际日期分组。根目录中英文 README 的渠道和安装说明也要一致；它们不重复写当前版本号。
- 历史 SDK 观察、真实安装身份和已发布日志保持原值和原有证据边界。明确授权的源码重编号只更新对应的源码身份和链接，并标明这是映射，不能冒充当时实际加载的版本，也不做全仓字符串替换。

Codex 的提交检查要求版本字符串非空、是语义化版本、最长 64 个字符，见[官方清单错误说明](https://developers.openai.com/plugins/deploy/submission-errors#plugin-manifest-errors)。Claude Code 的显式版本参与缓存更新，插件清单里的版本优先于市场条目；ZCode 用市场条目的版本判断是否更新，用插件清单读取已安装版本。所以本仓库保留这三处并校验一致，不能只更新其中一处。参考：[Claude Code 版本字段](https://code.claude.com/docs/en/plugins/manifest-reference#version)、[Claude Code 更新说明](https://code.claude.com/docs/en/plugins/host-marketplace#release-a-new-version)、[ZCode 插件管理](https://zcode.z.ai/en/docs/plugin#manage-plugins)。

这些官方字段约定和静态检查都不能代替已安装副本的验收。开发来源的选择、降级到正式渠道、缓存替换、宿主实际加载以及真实 Affinity SDK 行为，都要按具体任务另行核对。同名插件也不能只靠版本后缀就保证渠道隔离或自动切换。

## 两类检查

开发树上的格式与同步检查不需要 Git 历史，也不判断本批有没有递增：

```shell
node scripts/check-version.mjs --channel development
node --test scripts/check-version.test.mjs
```

交付增量检查要求 **Git 2.45+**，以及**已由维护者确认**的两个本地提交：上一开发交付和正式基准。下面的占位符要替换为确认后的完整提交 SHA：

```shell
node scripts/check-version.mjs --channel development --from <previous-development-commit> --stable <confirmed-production-commit>
```

`--from` 填上一开发交付的 `dev.N`，`--stable` 对应已确认的 `main` 正式快照；不要把旧开发版本误当成生产基准。首次从旧的稳定格式迁移时，仍支持显式指定旧开发快照。基准会解析成本地 commit，然后读取三份清单和两个代理声明并核对一致。历史基准里只认两种已知的代理布局：`scripts/affinity-mcp-proxy.mjs` 和 `skills/affinity-mcp/scripts/affinity-mcp-proxy.mjs`，并且必须恰好有一个入口。零个或两个入口、缺对象、缺必要文件、声明不一致，都会直接失败；读取失败后不会再去试另一个入口。当前文件系统仍要求新布局。脚本不会自动 fetch，也不修改 Git 状态，更无法证明指定基准就是远端最新版本；需要先做相应的只读核验，并保留输出里的完整 SHA。

所有针对基准的 Git 命令都显式带 `--no-lazy-fetch`，禁止部分克隆（partial clone）为缺失对象自动访问 promisor 远端或补写本地对象。缺对象时返回固定的失败信息；旧版 Git 不支持这个选项时同样失败，不会降级成“允许取对象”，也不会自动升级 Git。该选项从 [Git 2.45](https://raw.githubusercontent.com/git/git/v2.45.0/Documentation/RelNotes/2.45.0.txt) 引入，行为见[官方 Git 选项](https://git-scm.com/docs/git#Documentation/git.txt---no-lazy-fetch)。没有基准的静态模式仍然不调用 Git。

`--channel` 选择版本格式，不等同于 checkout 的分支名。`develop` 转正后，先运行正式格式的静态检查和增量检查：

```shell
node scripts/check-version.mjs --channel stable
node scripts/check-version.mjs --channel stable --from <confirmed-production-commit>
```

同步 `main` 时，从开发 checkout 用检查器显式指定 `--root <production-tree>`，参数为 `--channel stable --from <previous-production-commit>`；被检查的 Git 仓库必须包含基准对象。正式候选要求三份清单和两个代理声明一致，并且有与稳定版本匹配、日期有效的本版 CHANGELOG 条目。开发树转正时还要核对现行文档身份；生产树可以不含 `docs/`，但只要存在这个目录，身份声明就必须完整且一致。当前开发版本的未发布标题要移除；没有待交付内容时，连“未发布”分组一起省略。为了只读核验已发布的旧树，检查器仍接受历史空分组、旧式 `[Unreleased]` 和“版本 + 日期”合并标题；新日志统一用日期分组。检查器只验证元数据，不查询也不确认真实发布日期、远端发布状态或目标可见性。


版本核对之外，还要检查仓库的本地文档链接、安装引用和生产文件范围：

```shell
node scripts/check-links.mjs
```



## CHANGELOG 与正式交付

更新日志分语言维护。`CHANGELOG.md` 是英文，根标题为 `# Affinity MCP Changelog`；`CHANGELOG.zh-cn.md` 是简体中文，根标题为 `# Affinity MCP 更新日志`。两份日志的版本、日期、分类、条目数量和语义要逐项对应。存在中文日志时，版本检查会核对结构是否一致，但不会代替对翻译语义的人工审阅；历史单日志快照仍可只读核验。二级标题用 `## YYYY-MM-DD`，按交付日期倒序分组；组内用 `### MAJOR.MINOR.PATCH` 或完整的开发版本号标识版本。英文分类依次是 `Added`、`Changed`、`Fixed`、`Deprecated`、`Removed`、`Security`，中文对应“新增”“变更”“修复”“废弃”“移除”“安全”，都用四级标题，不保留空分类。同一天有多个版本时，它们共用一个日期分组。待交付候选分别放在顶部的 `## Unreleased` / `## 未发布` 分组里，不为还没发生的开发交付填日期，候选版本标题要和清单一致。没有待交付内容时，把未发布分组一起删掉，清单里的版本在对应交付日期下恰好只有一条。

日期取本版第一次实际交付当天的 UTC 日历日；开发渠道和正式渠道各自保留自己的记录。历史编号重映射时，沿用对应旧编号首次可确认的交付日。核对时优先查 [GitHub 仓库活动](https://github.com/Paloexiz/Affinity-MCP/activity)里的实际推送事件和对应源码版本；[活动 API](https://docs.github.com/en/rest/repos/repos#list-repository-activities)会给出时间、分支和前后提交，不要把 Git 作者、提交者或 tagger 日期当作推送日期。缺证据时，把版本放进“日期待核实”分组。正式候选按下面的流程预填计划日期，交付后再核对实际事件。整体按 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的原则，保留逐版本、同类变化和最新在前的摘要；日期分组和对应语言的分类是本仓库的展示约定。

两份 CHANGELOG 都面向插件使用者，只写该版本实际带来的能力、问题修复、兼容性，以及安装、升级或操作方式的变化。先对照这个版本的实际差异，再直接写“变了什么、影响什么”；不能只把旧文缩短，也不能用“完善”“加强”“优化”这类泛称代替具体变化。Skill/references 的更新要写成用户操作行为的变化，不要把 Agent 的执行步骤、实验过程或验收流水搬进来。内部版本治理、CI/hooks/测试维护、Git 操作、文档同步，以及日志自身的编辑活动，留在维护文档或提交记录里；不要写“更正某版说明”“精简更新日志”这种自我描述。没有变化的内容，只在解释兼容性影响时简短保留。会话、私人路径和本机测试记录不得写进日志。

版本编号和用户变化分开判断。每个已交付版本的版本号和日期都要保留；如果只是内部维护、没有用户可见变化，就在版本标题下写“无用户可见变更。”，英文写“No user-visible changes.”，不设分类，也不要硬造变更条目。开发版本遵守同样的内容边界。正式摘要汇总相对上一个正式版本的累计用户变化；不要因为一次文档批次就创建正式版本记录。

### 开发候选转为正式版本

确认正式目标的 core、并且候选通过验收后，把 `MAJOR.MINOR.PATCH-dev.N` 转成同 core 的 `MAJOR.MINOR.PATCH`，例如 `0.5.0-dev.1` 转成 `0.5.0`。SemVer 规定预发布版本的优先级低于对应的无后缀版本，但版本号本身不能证明验收或发布已经完成；`0.y.z` 仍属初始开发阶段，进入 `1.0.0` 表示开始定义稳定的公共 API。见 [SemVer 第 4、5、9、11 条](https://semver.org/spec/v2.0.0.html)。

下面的准备和冻结流程，以及 UTC 日期口径，都是本仓库自己的约定，不是 SemVer 或 Keep a Changelog 唯一规定的发布流程。只把流程写下来，或者只更新开发候选，都不构成正式交付授权：

1. 先明确这次授权要交付的正式目标和成功判据，例如用户可安装的远端 `main` 引用及对应制品。GitHub Release 算不算目标，由这次授权决定，不是默认前提。交付报告要记录目标引用、提交、制品身份和首次正式交付事件；不能只凭版本号、日志日期或检查成功就宣布发布。
2. **先在 `develop` 上转正。** 去掉候选版本的 `-dev.N` 后缀，同步三份清单、代理里的两处声明和现行文档；选定计划首次交付的 UTC 日期，把当前未发布内容和已交付开发批次的累计产品变化整理成两份 CHANGELOG 中该日期下的正式版本条目，历史条目保留。删掉已经转成正式版的未发布开发标题、空的 `Unreleased`／“未发布”分组，以及只对草稿成立的临时状态说明。候选状态写进交付报告；稳定制品里不要写“尚未发布”这类以后会失真的标记。
3. **验证转正后的确切文件内容。** 在 `develop` 的候选工作树里完成[正式格式的静态与增量检查](#两类检查)、适用测试和独立审查。审查本批改写的全部 CHANGELOG 条目和 Release 说明，逐条对照对应版本的实际差异，确认具体的用户影响、版本归属和双语语义；删掉没有用户影响的维护叙述，必要时用上面的无变更标记。正式摘要以上一个正式版本为基准，不能把旧功能再列成新增。结构检查通过不代表内容合格。之后按授权组织提交，版本号及所有现行版本声明统一放在本批最后一个 commit 里。后续如果内容有变化，要重新完成受影响的检查和复核。**先提交并推送 `develop`**，回读远端的确切 SHA、版本和交付日期；这一步完成后才能同步 `main`。
4. **从已推送的 `develop` 提交同步 `main`。** 使用上一步确认的确切 SHA，按 [main 分支保留范围](#production-content)逐文件提取安装内容和同一套根目录中英文 CHANGELOG，并清掉候选里残留的开发资料；不要递归复制整个资源目录。只保留生产 README 里有效的文档链接，去掉依赖开发测试目录的说明，并保留生产忽略规则。不要在 `main` 上首次转正，也不要再改版本号或 CHANGELOG，更不能只合并历史关系。核对完整生产文件集合、引用、版本、测试和审查结果后，提交并推送 `main`，再回读远端 SHA 和文件内容。
5. **首次正式交付必须发生在准备好的 UTC 日期。** `main` 已提供本版、正式 tag 已存在、公开 Release 已提供本版，这三者任一成立，就冻结版本、内容和日期。仅把 `develop` 转正推送或创建草稿 Release，都不单独算正式交付。转正推送之后、首次正式交付之前，进入候选冻结窗口：只允许下面说的日期修订或明确撤回，普通功能、配置和文档批次都要暂缓。结果不明时先停下来做只读核验；不能因为命令失败就认定尚未交付。已交付版本跨日后补齐剩余步骤时，仍使用原来的内容和日期。
6. **按已授权范围创建 tag 或 GitHub Release，并绑定已核对的生产提交。** 如果用 GitHub Release，正式版本不要勾选预发布标记；说明只用英文，内容对应英文 CHANGELOG 的本版条目，不要附其他版本的内容。启用不可变 Release 时，先建草稿、补齐附件，再发布。发布后回读 tag 指向、Release 状态和附件身份。市场可见性和实际安装副本另行核对；安装文件一致，不等于宿主已经刷新或在线连接已经通过。[GitHub 发布流程](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)。

### 未正式交付候选的修订与撤回

- 尚未发布的候选可以只调整双语日志日期，版本号不变。
- 需要修复缺陷时保持同一 core，退回最近一次转正前开发编号的下一个 `dev.N`；`main`、正式 tag 或公开 Release 任一已交付后，不得回改。
