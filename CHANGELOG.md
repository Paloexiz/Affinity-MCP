# Affinity MCP 更新日志

## 2026-10-16

### 0.4.2-dev.1

#### 变更

- 回归测试的临时路径按项目用途命名，保留空格、中文及特殊字符的路径覆盖。

## 2026-10-15

### 0.4.1

#### 变更

- 更新中英文安装与更新说明，版本规则链接至专门文档，移除分支维护背景说明。

## 2026-10-14

### 0.4.1-dev.1

#### 变更

- 版本记录按已核实的交付日期分组，并区分开发批次和正式版本。
- 开发交付使用下一正式目标的 `-dev.N` 版本，`main` 保留正式版本；同一批修改和复审共用一个开发编号，纯维护交付不强迫生产升版。

#### 修复

- 版本增量检查在部分克隆缺少基准对象时明确失败，不自动下载远端对象；增量模式要求 Git 2.45+，静态检查仍无需 Git。
- 仓库文档 hooks 在正文暂时无法读取时保留已取得的前置基线，恢复后仍可核对本轮变更。
- 缺少前置基线时给出人工核验提示，不再要求无法完成的自动复核，也不因单纯的历史基线缺口触发续跑。
- 版本增量检查支持已确认的旧代理布局基准；歧义入口或缺失对象明确失败，仍不自动获取远端对象。

## 2026-10-13

### 0.4.0

#### 变更

- 代理与连接检查脚本随 Skill 目录一起打包，完整 Plugin 清单负责注册 MCP；单独安装 Skill 不会注册服务。[对应迁移](https://github.com/Paloexiz/Affinity-MCP/commit/5860d74187919d1d8ba334bebeee5354aafa0a34)。
- 生产分支只保留安装所需内容和本日志；开发维护资源留在开发分支。
- 源码版本从 `0.1.0` 起按产品影响和渠道重新编号；开发快照 `0.4.0-dev.1` 对应这个正式目标。旧 clone、固定提交链接和插件缓存不会自动切换到新历史，需要核对所选来源和加载副本。

#### 修复

- SSE 解析识别无冒号的 `event` 与 `data` 字段，分别重置事件类型和追加数据换行。[对应修复](https://github.com/Paloexiz/Affinity-MCP/commit/2053175fae5dee46cd0b3c64b35915be58fa6a8c)。

## 2026-10-12

### 0.4.0-dev.1

#### 变更

- 代理与连接检查脚本迁入 Skill 目录，运行资源随完整 Plugin 安装一起交付。[对应迁移](https://github.com/Paloexiz/Affinity-MCP/commit/5860d74187919d1d8ba334bebeee5354aafa0a34)。

#### 修复

- SSE 解析识别无冒号的 `event` 与 `data` 字段。[对应修复](https://github.com/Paloexiz/Affinity-MCP/commit/2053175fae5dee46cd0b3c64b35915be58fa6a8c)。

### 0.3.0

#### 新增

- 提供显式选择已安装 Plugin 副本的连接检查，核对版本、在线工具发现和 SDK preamble。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/3f0372849d5bb9f06bfa5d2ab3156560ad2801e1)。

#### 修复

- 加强代理的输入校验、上游握手及超时/断线诊断，区分尚未提交和结果未知，避免把发现降级当作真实在线连接。[对应修复](https://github.com/Paloexiz/Affinity-MCP/commit/9217cd0dc808568483ceb33b5021168833b500f2)。

## 2026-10-09

### 0.2.0

#### 新增

- 提供 `AFFINITY_MCP_REQUEST_TIMEOUT_MS` 环境变量及结构化错误诊断。

#### 变更

- 加强 MCP 工作流程与 SDK 指引中的操作边界和验证要求。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/f573a06286be5aca6d6f04300206d55730242890)。

## 2026-09-15

### 0.1.0

#### 新增

- 初始源码包含插件清单、本地 MCP 代理及 Affinity 操作 Skill。[源码快照](https://github.com/Paloexiz/Affinity-MCP/commit/da09315609c75410562d473292cdf276542a2554)。
