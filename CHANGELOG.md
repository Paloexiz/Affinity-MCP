# Changelog

本文件记录 Affinity MCP 对使用者有意义的变化，采用 [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) 的分类方式和 [SemVer](https://semver.org/spec/v2.0.0.html) 的版本格式。版本和日期元数据本身不证明实际发布；实际交付须另以目标引用和制品核对。

## [CURRENT_TARGET] - CURRENT_DATE

日期是重编号后源码身份的计划首次正式交付 UTC 日，不是对应旧源码的原始发布日期。

### Changed

- 代理与连接检查脚本随 Skill 目录一起打包，完整 Plugin 清单负责注册 MCP；单独安装 Skill 不会注册服务。[对应迁移](https://github.com/Paloexiz/Affinity-MCP/commit/5860d74187919d1d8ba334bebeee5354aafa0a34)。
- 生产分支只保留安装所需内容和本日志；开发维护资源留在开发分支。
- 源码版本从 `0.1.0` 起按产品影响和渠道重新编号；开发快照 `0.4.0-dev.1` 对应这个正式目标。旧 clone、固定提交链接和插件缓存不会自动切换到新历史，需要核对所选来源和加载副本。

### Fixed

- SSE 解析识别无冒号的 `event` 与 `data` 字段，分别重置事件类型和追加数据换行。[对应修复](https://github.com/Paloexiz/Affinity-MCP/commit/2053175fae5dee46cd0b3c64b35915be58fa6a8c)。

## 历史源码版本记录

以下编号是经明确迁移的历史源码身份，原交付日期未知；不是补造的发布清单。Git 作者、提交者和 tagger 日期只保留为源码来源。未确认到旧编号中的额外交付节点，不为编号空缺补造版本或标签。

## [0.3.0] - 原交付日期未知（重编号源码记录）

### Added

- 提供显式选择已安装 Plugin 副本的连接检查，核对版本、在线工具发现和 SDK preamble。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/3f0372849d5bb9f06bfa5d2ab3156560ad2801e1)。

### Fixed

- 加强代理的输入校验、上游握手及超时/断线诊断，区分尚未提交和结果未知，避免把发现降级当作真实在线连接。[对应修复](https://github.com/Paloexiz/Affinity-MCP/commit/9217cd0dc808568483ceb33b5021168833b500f2)。

## [0.2.0] - 原交付日期未知（重编号源码记录）

### Added

- 提供 `AFFINITY_MCP_REQUEST_TIMEOUT_MS` 环境变量及结构化错误诊断。

### Changed

- 加强 MCP 工作流程与 SDK 指引中的操作边界和验证要求。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/f573a06286be5aca6d6f04300206d55730242890)。

## [0.1.0] - 原交付日期未知（重编号源码记录）

### Added

- 初始源码包含插件清单、本地 MCP 代理及 Affinity 操作 Skill。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/da09315609c75410562d473292cdf276542a2554)。
